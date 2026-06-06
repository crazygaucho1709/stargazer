#!/usr/bin/env python3
"""
Stargazer Live Stacking Worker
Real-time image stacking for deep sky astrophotography
Handles Alt-Az field rotation and auto-alignment
"""

import os
import time
import logging
import numpy as np
import rawpy
import cv2
from pathlib import Path
from collections import deque
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import threading

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('stacking_worker.log', mode='a')
    ]
)
logger = logging.getLogger(__name__)


class StarAligner:
    """OpenCV-based star detection and image alignment"""
    
    def __init__(self):
        # Use ORB for star detection - faster than SIFT
        self.orb = cv2.ORB_create(nfeatures=3000, scaleFactor=1.2, nlevels=8, edgeThreshold=31)
        
        # Use BFMatcher for feature matching
        self.bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        
        # Minimum matches required for valid alignment
        self.min_matches = 15
        self.max_reproj_error = 5.0
        
    def detect_stars(self, gray):
        """Detect keypoints (stars) in grayscale image"""
        # Find keypoints and descriptors
        kp, desc = self.orb.detectAndCompute(gray, None)
        return kp, desc
    
    def compute_homography(self, kp1, kp2, desc1, desc2):
        """Compute transformation matrix between two images"""
        if desc1 is None or desc2 is None:
            return None, None
        
        # Match features
        matches = self.bf.knnMatch(desc1, desc2, k=2)
        
        # Apply Lowe's ratio test
        good_matches = []
        for m_n in matches:
            if len(m_n) == 2:
                if m_n[0].distance < 0.75 * m_n[1].distance:
                    good_matches.append(m_n[0])
        
        if len(good_matches) < self.min_matches:
            return None, None
        
        # Extract matched keypoints
        src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 2)
        
        # Compute homography with RANSAC
        try:
            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 3.0, maxIters=2000)
            
            if M is not None:
                # Check inlier ratio
                inliers = mask.ravel().sum()
                inlier_ratio = inliers / len(good_matches)
                
                if inlier_ratio < 0.5:
                    logger.warning(f"Low inlier ratio: {inlier_ratio:.2%}")
                    return None, None
                    
                return M, inliers
                
        except Exception as e:
            logger.error(f"Homography computation failed: {e}")
            
        return None, None
    
    def align_images(self, ref_gray, new_gray):
        """
        Align new image to reference using star-based registration
        Returns transformation matrix and inlier count
        """
        # Detect stars in both images
        kp_ref, desc_ref = self.detect_stars(ref_gray)
        kp_new, desc_new = self.detect_stars(new_gray)
        
        if len(kp_ref) < 10 or len(kp_new) < 10:
            logger.warning(f"Insufficient stars detected - Ref: {len(kp_ref)}, New: {len(kp_new)}")
            return None, 0
        
        # Compute homography
        M, inliers = self.compute_homography(kp_ref, kp_new, desc_ref, desc_new)
        
        if M is not None:
            logger.info(f"Alignment successful: {inliers} inliers")
        
        return M, inliers
    
    def apply_transform(self, img, M, target_size):
        """Apply transformation matrix to image"""
        if M is None:
            return None
            
        try:
            # Warp image using perspective transform
            aligned = cv2.warpPerspective(img, M, target_size, 
                                          flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
                                          borderMode=cv2.BORDER_REFLECT)
            return aligned
        except Exception as e:
            logger.error(f"Transform application failed: {e}")
            return None


class StackingWorker:
    """Main stacking engine with file watcher"""
    
    def __init__(self, watch_folder: str, output_path: str, max_stack: int = 50):
        self.watch_folder = Path(watch_folder)
        self.output_path = Path(output_path)
        self.max_stack = max_stack
        
        # Stack state
        self.reference_frame = None
        self.reference_gray = None
        self.master_stack = None
        self.frame_count = 0
        self.session_start = None
        self.aligner = StarAligner()
        
        # Stats
        self.dropped_frames = 0
        self.stacked_frames = 0
        
        # Thread safety
        self.lock = threading.Lock()
        
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"StackingWorker initialized:")
        logger.info(f"  Watch folder: {self.watch_folder}")
        logger.info(f"  Output: {self.output_path}")
        logger.info(f"  Max stack: {max_stack}")
    
    def load_raw(self, filepath: Path) -> np.ndarray:
        """Load and demosaic CR2 file"""
        try:
            with rawpy.imread(str(filepath)) as raw:
                # Postprocess to remove dead pixels and improve quality
                rgb = raw.postprocess(
                    use_camera_wb=False,      # Use camera white balance
                    no_auto_bright=False,     # Don't auto-brighten
                    exposureGamma=1.0,        # Linear gamma
                    user_flip=None,
                    half_size=False,          # Full resolution
                    four_color_rggb=False,
                    remove_hot_pixels=True,
                    dead_pixel_filter=True,
                )
                return rgb.astype(np.float32)
        except Exception as e:
            logger.error(f"Failed to load RAW {filepath}: {e}")
            return None
    
    def rgb_to_gray(self, rgb: np.ndarray) -> np.ndarray:
        """Convert RGB to grayscale for alignment"""
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    
    def normalize_image(self, img: np.ndarray) -> np.ndarray:
        """Normalize image to 0-255 range"""
        if img.max() > img.min():
            normalized = (img - img.min()) / (img.max() - img.min()) * 255
        else:
            normalized = np.zeros_like(img)
        return normalized.astype(np.uint8)
    
    def auto_stretch(self, img: np.ndarray) -> np.ndarray:
        """
        Apply non-linear stretching to reveal faint nebulosity
        Uses asinh stretch for natural-looking results
        """
        # Normalize first
        img_norm = self.normalize_image(img)
        
        # Asinh stretch (common in astrophotography)
        # scale determines how bright the stretch starts
        scale = img_norm.max() / 10.0
        stretched = np.arcsinh(img_norm / scale) / np.arcsinh(255 / scale) * 255
        
        # Additional contrast enhancement
        stretched = np.clip(stretched, 0, 255).astype(np.uint8)
        
        return stretched
    
    def reset_session(self):
        """Reset stacking session"""
        with self.lock:
            self.reference_frame = None
            self.reference_gray = None
            self.master_stack = None
            self.frame_count = 0
            self.session_start = datetime.now()
            self.dropped_frames = 0
            self.stacked_frames = 0
            logger.info("Stack session reset")
    
    def process_frame(self, filepath: Path) -> bool:
        """Process a single frame and add to stack"""
        with self.lock:
            logger.info(f"Processing: {filepath.name}")
            
            # Load RAW
            rgb = self.load_raw(filepath)
            if rgb is None:
                return False
            
            h, w = rgb.shape[:2]
            target_size = (w, h)
            
            # First frame - set as reference
            if self.reference_frame is None:
                logger.info(f"Setting reference frame: {filepath.name}")
                self.reference_frame = rgb.copy()
                self.reference_gray = self.rgb_to_gray(rgb)
                self.master_stack = rgb.copy()
                self.frame_count = 1
                self.stacked_frames = 1
                self.session_start = datetime.now()
                self._save_output()
                return True
            
            # Convert to grayscale for alignment
            gray = self.rgb_to_gray(rgb)
            
            # Align to reference
            M, inliers = self.aligner.align_images(self.reference_gray, gray)
            
            if M is None or inliers < self.aligner.min_matches:
                logger.warning(f"Frame dropped - alignment failed (inliers: {inliers})")
                self.dropped_frames += 1
                return False
            
            # Apply transformation to RGB image
            aligned = self.aligner.apply_transform(rgb, M, target_size)
            if aligned is None:
                logger.warning("Frame dropped - transform failed")
                self.dropped_frames += 1
                return False
            
            # Cumulative stacking (running average)
            # Master = Master + (New - Master) / N
            self.frame_count += 1
            self.stacked_frames += 1
            
            # Use cumulative mean formula to avoid storing all frames
            alpha = 1.0 / self.frame_count
            self.master_stack = self.master_stack + alpha * (aligned - self.master_stack)
            
            # Enforce max stack limit - restart if exceeded
            if self.frame_count > self.max_stack:
                logger.info(f"Max stack size ({self.max_stack}) reached - blending old frames")
                # Simple approach: continue but reduce weight of older frames
                # For full reset, call reset_session()
            
            # Save output
            self._save_output()
            
            logger.info(f"Stack updated: {self.frame_count} frames, {self.dropped_frames} dropped")
            return True
    
    def _save_output(self):
        """Save current stack to output file"""
        if self.master_stack is None:
            return
            
        # Apply auto-stretch
        stretched = self.auto_stretch(self.master_stack)
        
        # Save as JPEG (smaller than PNG, fast for web)
        try:
            cv2.imwrite(str(self.output_path), cv2.cvtColor(stretched, cv2.COLOR_RGB2BGR))
            logger.debug(f"Saved stack to {self.output_path}")
        except Exception as e:
            logger.error(f"Failed to save output: {e}")
    
    def get_stats(self) -> dict:
        """Get current stacking statistics"""
        return {
            'frame_count': self.frame_count,
            'stacked_frames': self.stacked_frames,
            'dropped_frames': self.dropped_frames,
            'session_start': self.session_start.isoformat() if self.session_start else None,
            'success_rate': self.stacked_frames / max(1, self.stacked_frames + self.dropped_frames)
        }


class CR2EventHandler(FileSystemEventHandler):
    """Watchdog event handler for CR2 files"""
    
    def __init__(self, worker: StackingWorker):
        self.worker = worker
        self.processed_files = set()
        self.last_modified = {}
        
    def on_created(self, event):
        if event.is_directory:
            return
            
        filepath = Path(event.src_path)
        
        # Only process CR2 files
        if filepath.suffix.upper() not in ['.CR2', '.CR3', '.NEF', '.ARW']:
            return
            
        logger.info(f"New file detected: {filepath.name}")
        
        # Wait for file to be fully written
        self._wait_for_file(filepath)
        
        # Process the file
        if filepath not in self.processed_files:
            self.processed_files.add(filepath)
            self.worker.process_frame(filepath)
    
    def _wait_for_file(self, filepath: Path, max_wait: int = 30):
        """Wait for file to stop growing (write complete)"""
        if not filepath.exists():
            return
            
        initial_size = filepath.stat().st_size
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            if not filepath.exists():
                return
                
            current_size = filepath.stat().st_size
            
            if current_size == initial_size:
                # File hasn't changed for 2 seconds, likely complete
                time.sleep(2)
                return
                
            initial_size = current_size
            time.sleep(1)
        
        logger.warning(f"File write timeout: {filepath.name}")


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Stargazer Live Stacking Worker')
    parser.add_argument('--watch', '-w', required=True, help='Folder to watch for CR2 files')
    parser.add_argument('--output', '-o', required=True, help='Output JPEG path')
    parser.add_argument('--max-stack', '-m', type=int, default=50, help='Maximum frames to stack')
    parser.add_argument('--reset', '-r', action='store_true', help='Reset existing stack on start')
    
    args = parser.parse_args()
    
    # Verify watch folder exists
    watch_path = Path(args.watch)
    if not watch_path.exists():
        logger.error(f"Watch folder does not exist: {args.watch}")
        return
    
    # Create stacking worker
    worker = StackingWorker(args.watch, args.output, args.max_stack)
    
    # Reset if requested
    if args.reset:
        worker.reset_session()
    
    # Check for existing files in watch folder
    existing_cr2 = sorted(watch_path.glob('*.CR2'))
    if existing_cr2:
        logger.info(f"Found {len(existing_cr2)} existing CR2 files")
        for cr2 in existing_cr2[:5]:  # Process first 5
            worker.process_frame(cr2)
    
    # Setup file watcher
    event_handler = CR2EventHandler(worker)
    observer = Observer()
    observer.schedule(event_handler, str(watch_path), recursive=False)
    observer.start()
    
    logger.info("=" * 60)
    logger.info("STARGAZER STACKING WORKER - STARTED")
    logger.info(f"Watching: {args.watch}")
    logger.info(f"Output: {args.output}")
    logger.info("=" * 60)
    
    try:
        while True:
            time.sleep(10)
            # Log stats periodically
            stats = worker.get_stats()
            logger.info(f"Stats: {stats['frame_count']} frames, "
                       f"{stats['stacked_frames']} stacked, "
                       f"{stats['dropped_frames']} dropped")
            
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        observer.stop()
    
    observer.join()
    logger.info("Stacking worker stopped")


if __name__ == '__main__':
    main()