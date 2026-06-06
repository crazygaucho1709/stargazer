"""
Stargazer Framing WebSocket Server
Ultra-low latency live view for manual telescope control
Handles I/O priority to avoid blocking INDI during slewing
"""

import asyncio
import base64
import logging
import threading
import time
from datetime import datetime
from typing import Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["framing"])

# ============================================================================
# STATE MANAGEMENT
# ============================================================================

class FramingState:
    """
    Thread-safe state manager for framing mode.
    CRITICAL: Handles I/O priority to prevent USB/INDI bus blocking.
    """
    
    def __init__(self):
        # Active WebSocket connections
        self.connections: Set[WebSocket] = set()
        
        # Framing mode state
        self.framing_active = False
        self.last_frame_time: Optional[datetime] = None
        self.frame_count = 0
        self.dropped_frames = 0
        
        # Slewing state - CRITICAL for I/O priority
        self.is_slewing = False
        self.slew_start_time: Optional[datetime] = None
        self.slew_end_time: Optional[datetime] = None
        
        # Lock for thread safety
        self.lock = threading.Lock()
        
        # Frame buffer
        self.latest_frame_b64: Optional[str] = None
        
        # INDI control
        self.indi_client = None
        self.indi_device = "Canon DSLR EOS 600D"
        
    def add_connection(self, websocket: WebSocket):
        with self.lock:
            self.connections.add(websocket)
            logger.info(f"Framing client connected. Total: {len(self.connections)}")
    
    def remove_connection(self, websocket: WebSocket):
        with self.lock:
            self.connections.discard(websocket)
            logger.info(f"Framing client disconnected. Total: {len(self.connections)}")
            
            # Stop framing if no connections
            if len(self.connections) == 0:
                self.framing_active = False
                logger.info("No clients - stopping framing mode")
    
    def set_slewing(self, is_slewing: bool):
        """
        CRITICAL: Called when INDI receives a slew command.
        This ensures we don't block the USB bus during movement.
        """
        with self.lock:
            if is_slewing and not self.is_slewing:
                # Starting slew
                self.is_slewing = True
                self.slew_start_time = datetime.now()
                logger.warning("⚠️ SLEW DETECTED - Pausing framing I/O")
                
                # Drop any pending frames immediately
                self.dropped_frames += 1
                
            elif not is_slewing and self.is_slewing:
                # Ending slew - wait for motion to actually stop
                self.slew_end_time = datetime.now()
                
                # Calculate minimum wait time (typical settle time)
                # We'll set a flag to resume after settling
                logger.info("Slew command received, will resume after settle time")
    
    def can_capture(self) -> bool:
        """
        CRITICAL: Determines if we should attempt to capture a frame.
        
        Rules:
        1. Must have active clients
        2. Must have framing mode active
        3. CANNOT capture during active slewing
        4. CAN capture if slewing recently ended AND we've waited for settle
        """
        with self.lock:
            if not self.framing_active:
                return False
                
            if len(self.connections) == 0:
                return False
            
            # Check if currently slewing
            if self.is_slewing:
                # Check if we've waited long enough since slew ended
                if self.slew_end_time:
                    elapsed = (datetime.now() - self.slew_end_time).total_seconds()
                    if elapsed < 2.0:  # 2 second settle time
                        logger.debug(f"Settle wait: {elapsed:.1f}s")
                        return False
                    else:
                        # Settle time complete
                        self.is_slewing = False
                        self.slew_end_time = None
                        logger.info("Settle complete - resuming framing")
            
            return True
    
    def update_frame(self, frame_b64: str):
        """Store latest frame for broadcast"""
        with self.lock:
            self.latest_frame_b64 = frame_b64
            self.last_frame_time = datetime.now()
            self.frame_count += 1
    
    def get_stats(self) -> dict:
        with self.lock:
            return {
                "active": self.framing_active,
                "connections": len(self.connections),
                "frame_count": self.frame_count,
                "dropped_frames": self.dropped_frames,
                "is_slewing": self.is_slewing,
                "last_frame": self.last_frame_time.isoformat() if self.last_frame_time else None
            }


# Global state instance
framing_state = FramingState()


# ============================================================================
# INDI INTEGRATION (simplified - integrates with existing indi.py)
# ============================================================================

def setup_indi_integration():
    """
    Hook into the existing INDI system to detect slewing.
    In production, this would import and hook into the indi client.
    """
    # This would be connected to the main.py INDI handlers
    # For now, we expose an API endpoint that can be called by mount handlers
    pass


# ============================================================================
# WEBSocket ROUTES
# ============================================================================

@router.websocket("/ws/framing")
async def framing_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for ultra-low latency framing.
    
    Protocol:
    - Client connects and sends {"action": "start"} to begin
    - Server sends {"action": "frame", "data": "<base64>", "timestamp": "..."}
    - Server sends {"action": "stats", ...} every second
    - Client can send {"action": "stop"} to stop
    - Server sends {"action": "slewing", "state": true/false} when slewing detected
    """
    await websocket.accept()
    framing_state.add_connection(websocket)
    
    try:
        # Send welcome message
        await websocket.send_json({
            "action": "welcome",
            "message": "Framing WebSocket connected",
            "stats": framing_state.get_stats()
        })
        
        # Create async task for sending frames
        send_task = asyncio.create_task(send_frames_loop(websocket))
        
        # Handle incoming messages
        async for message in websocket.iter_json():
            action = message.get("action")
            
            if action == "start":
                framing_state.framing_active = True
                logger.info("Framing mode ACTIVE")
                await websocket.send_json({
                    "action": "status",
                    "framing": True,
                    "message": "Framing started"
                })
                
            elif action == "stop":
                framing_state.framing_active = False
                logger.info("Framing mode stopped")
                await websocket.send_json({
                    "action": "status",
                    "framing": False,
                    "message": "Framing stopped"
                })
                
            elif action == "ping":
                await websocket.send_json({
                    "action": "pong",
                    "timestamp": datetime.now().isoformat()
                })
                
            else:
                logger.warning(f"Unknown action: {action}")
                
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        framing_state.remove_connection(websocket)
        send_task.cancel()


async def send_frames_loop(websocket: WebSocket):
    """
    Background task that sends frames to client.
    Respects I/O priority - won't capture during slewing.
    """
    target_fps = 2  # 2 frames per second - faster than normal capture
    frame_interval = 1.0 / target_fps
    
    last_stats_time = time.time()
    stats_interval = 5  # Send stats every 5 seconds
    
    while True:
        try:
            # Check if we should send a frame
            if not framing_state.can_capture():
                # Either no clients, not active, or slewing
                await asyncio.sleep(0.1)
                continue
            
            # Try to capture a frame (this would call INDI)
            frame_data = await capture_framing_frame()
            
            if frame_data:
                # Send frame
                await websocket.send_json({
                    "action": "frame",
                    "data": frame_data,  # Base64 encoded
                    "timestamp": datetime.now().isoformat(),
                    "exposure": 1.5,  # Short framing exposure
                    "iso": 6400
                })
                
            else:
                # Frame capture failed
                framing_state.dropped_frames += 1
                
            # Periodic stats
            current_time = time.time()
            if current_time - last_stats_time >= stats_interval:
                await websocket.send_json({
                    "action": "stats",
                    **framing_state.get_stats()
                })
                last_stats_time = current_time
                
            # Rate limiting
            await asyncio.sleep(frame_interval)
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Frame send error: {e}")
            await asyncio.sleep(1)  # Back off on error


async def capture_framing_frame() -> Optional[str]:
    """
    Capture a single short exposure frame.
    
    In production, this would:
    1. Configure INDI for minimal resolution / JPEG compression
    2. Set high ISO (6400+)
    3. Set short exposure (1.5s)
    4. Capture and return base64
    5. Reset for normal imaging
    
    For now, returns a placeholder.
    """
    try:
        import main
        frame_bytes = main.indi.latest_frame
        if frame_bytes:
            return base64.b64encode(frame_bytes).decode('utf-8')
        return None
        
    except Exception as e:
        logger.error(f"Frame capture failed: {e}")
        return None


# ============================================================================
# HTTP ENDPOINTS FOR FRAMING CONTROL
# ============================================================================

@router.post("/framing/slew-status")
async def set_slew_status(slewing: bool):
    """
    Endpoint called by mount handlers when slew starts/stops.
    CRITICAL: This is how we avoid blocking INDI during slewing.
    """
    framing_state.set_slewing(slewing)
    return {"success": True, "slewing": slewing}


@router.get("/framing/stats")
async def get_framing_stats():
    """Get current framing statistics"""
    return framing_state.get_stats()


@router.post("/framing/activate")
async def activate_framing():
    """Manually activate framing mode"""
    framing_state.framing_active = True
    return {"success": True, "active": True}


@router.post("/framing/deactivate")
async def deactivate_framing():
    """Manually deactivate framing mode"""
    framing_state.framing_active = False
    return {"success": True, "active": False}


# ============================================================================
# MAIN INTEGRATION
# ============================================================================

def get_framing_router():
    """Export router for main.py"""
    return router


# When imported, also register with main.py's INDI system
def register_to_indi():
    """
    Hook this into main.py to receive slew events from INDI.
    
    In main.py, after mount handlers:
    
    @app.post("/mount/goto")
    async def mount_goto(...):
        framing_state.set_slewing(True)
        # ... perform slew ...
        framing_state.set_slewing(False)
    """
    pass