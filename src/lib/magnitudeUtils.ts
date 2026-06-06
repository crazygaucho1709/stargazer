/**
 * Magnitude Calculator Utilities
 * Based on telescope physics for Maksutov 102mm f/13 + APS-C sensor
 */

// Constants for Celestron NexStar 4SE (102mm f/13)
export const TELESCOPE_CONFIG = {
    apertureMm: 102,
    focalRatio: 13,
    focalLengthMm: 1326, // 102 * 13
    sensorPixelSizeUm: 4.3, // Canon 600D pixel size
};

/**
 * Calculate limiting magnitude using logarithmic formula
 * M_limit = 12.5 + (2.5 * log10(Exposure_Time)) + (1.25 * log10(Stack_Count))
 * 
 * @param exposureSeconds - Exposure time in seconds
 * @param stackCount - Number of stacked frames
 * @returns Estimated limiting magnitude
 */
export function calculateLimitingMagnitude(
    exposureSeconds: number,
    stackCount: number
): number {
    if (exposureSeconds <= 0 || stackCount <= 0) {
        return 0;
    }
    
    const baseMagnitude = 12.5;
    const exposureFactor = 2.5 * Math.log10(exposureSeconds);
    const stackFactor = 1.25 * Math.log10(stackCount);
    
    return baseMagnitude + exposureFactor + stackFactor;
}

/**
 * Calculate recommended exposure for target magnitude
 * Inverse of the limiting magnitude formula
 * 
 * @param targetMagnitude - Target magnitude to reach
 * @param stackCount - Number of frames to stack
 * @returns Recommended exposure in seconds
 */
export function calculateRecommendedExposure(
    targetMagnitude: number,
    stackCount: number
): number {
    if (targetMagnitude <= 0 || stackCount <= 0) {
        return 1;
    }
    
    const baseMagnitude = 12.5;
    const stackFactor = 1.25 * Math.log10(stackCount);
    
    // Rearranging: target = base + 2.5*log10(exp) + stackFactor
    // target - base - stackFactor = 2.5 * log10(exp)
    // exp = 10^((target - base - stackFactor) / 2.5)
    
    const remainingMagnitude = targetMagnitude - baseMagnitude - stackFactor;
    const recommendedExposure = Math.pow(10, remainingMagnitude / 2.5);
    
    // Clamp to reasonable values (0.1s to 300s)
    return Math.max(0.1, Math.min(300, recommendedExposure));
}

/**
 * Calculate recommended stack count for target magnitude
 * 
 * @param targetMagnitude - Target magnitude to reach
 * @param exposureSeconds - Available exposure time per frame
 * @returns Recommended number of frames to stack
 */
export function calculateRecommendedStackCount(
    targetMagnitude: number,
    exposureSeconds: number
): number {
    if (targetMagnitude <= 0 || exposureSeconds <= 0) {
        return 1;
    }
    
    const baseMagnitude = 12.5;
    const exposureFactor = 2.5 * Math.log10(exposureSeconds);
    
    // target = base + exposureFactor + 1.25*log10(stack)
    // stack = 10^((target - base - exposureFactor) / 1.25)
    
    const remainingMagnitude = targetMagnitude - baseMagnitude - exposureFactor;
    const recommendedStack = Math.pow(10, remainingMagnitude / 1.25);
    
    // Clamp to reasonable values (1 to 500)
    return Math.max(1, Math.min(500, Math.round(recommendedStack)));
}

/**
 * Check if an object is observable with current settings
 * 
 * @param objectMagnitude - Magnitude of the target object
 * @param exposureSeconds - Current exposure time
 * @param stackCount - Current stack count
 * @param margin - Safety margin in magnitudes (default 0.5)
 * @returns Whether the object is observable
 */
export function isObjectObservable(
    objectMagnitude: number,
    exposureSeconds: number,
    stackCount: number,
    margin: number = 0.5
): boolean {
    const limit = calculateLimitingMagnitude(exposureSeconds, stackCount);
    return objectMagnitude <= limit + margin;
}

/**
 * Get observation quality rating for an object
 * 
 * @param objectMagnitude - Magnitude of the target
 * @param exposureSeconds - Current exposure time
 * @param stackCount - Current stack count
 * @returns 'excellent' | 'good' | 'fair' | 'poor' | 'impossible'
 */
export function getObservationQuality(
    objectMagnitude: number,
    exposureSeconds: number,
    stackCount: number
): 'excellent' | 'good' | 'fair' | 'poor' | 'impossible' {
    const limit = calculateLimitingMagnitude(exposureSeconds, stackCount);
    const difference = limit - objectMagnitude;
    
    if (difference < 0) return 'impossible';
    if (difference < 0.5) return 'poor';
    if (difference < 1.0) return 'fair';
    if (difference < 2.0) return 'good';
    return 'excellent';
}

/**
 * Calculate theoretical seeing resolution (arc seconds)
 * Based on telescope aperture
 */
export function calculateSeeingResolution(): number {
    // Dawes limit: 4.56 / aperture in inches
    // Convert to arcseconds
    const apertureInches = TELESCOPE_CONFIG.apertureMm / 25.4;
    const dawesArcseconds = 4.56 / apertureInches;
    
    // Apply typical atmospheric seeing (1.5-2 arcsec)
    return Math.max(dawesArcseconds * 1.5, 1.5);
}

/**
 * Calculate maximum useful magnification
 */
export function calculateMaxMagnification(): number {
    // 2x per mm of aperture as rule of thumb
    return TELESCOPE_CONFIG.apertureMm * 2;
}

/**
 * Calculate field of view for given sensor
 */
export function calculateFieldOfView(): { width: number; height: number } {
    const sensorWidthMm = 22.3; // Canon 600D width
    const sensorHeightMm = 14.9; // Canon 600D height
    
    const fovWidth = (sensorWidthMm / TELESCOPE_CONFIG.focalLengthMm) * 57.3; // degrees
    const fovHeight = (sensorHeightMm / TELESCOPE_CONFIG.focalLengthMm) * 57.3;
    
    return { width: fovWidth, height: fovHeight };
}

/**
 * Format magnitude for display
 */
export function formatMagnitude(mag: number): string {
    if (mag <= 0) return 'N/A';
    return mag.toFixed(1);
}