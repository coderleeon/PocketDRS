import { Point } from '@/core/types';

// Default pitch dimensions (meters)
export const PITCH_WIDTH = 3.05; // 10 feet
export const PITCH_LENGTH = 20.12; // 22 yards

/**
 * Computes the homography and inverse homography matrices using OpenCV.js.
 * Requires window.cv to be fully initialized.
 */
export function calculateHomography(
  pitchPoints: Point[]
): { homography: number[] | null; invHomography: number[] | null } {
  if (pitchPoints.length !== 4) {
    console.error('Calibration requires exactly 4 points.');
    return { homography: null, invHomography: null };
  }

  if (!window.cv || !window.cv.matFromArray) {
    console.error('OpenCV.js is not loaded yet.');
    return { homography: null, invHomography: null };
  }

  try {
    const cv = window.cv;

    // Source points (pixels in camera/canvas space)
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      pitchPoints[0].x, pitchPoints[0].y, // Far-Left
      pitchPoints[1].x, pitchPoints[1].y, // Far-Right
      pitchPoints[2].x, pitchPoints[2].y, // Near-Right
      pitchPoints[3].x, pitchPoints[3].y  // Near-Left
    ]);

    // Destination points (meters on the 2D pitch plane)
    const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,                         // Far-Left (Y=0 at bowler's end)
      PITCH_WIDTH, 0,               // Far-Right (Y=0 at bowler's end)
      PITCH_WIDTH, PITCH_LENGTH,     // Near-Right (Y=20.12 at batsman's end)
      0, PITCH_LENGTH               // Near-Left (Y=20.12 at batsman's end)
    ]);

    // Calculate homography: Pixel -> Meter
    const H = cv.getPerspectiveTransform(srcPoints, dstPoints);
    // Calculate inverse homography: Meter -> Pixel
    const H_inv = cv.getPerspectiveTransform(dstPoints, srcPoints);

    const homographyArray = Array.from(H.data64F) as number[];
    const invHomographyArray = Array.from(H_inv.data64F) as number[];

    // Clean up WASM memory
    srcPoints.delete();
    dstPoints.delete();
    H.delete();
    H_inv.delete();

    return {
      homography: homographyArray,
      invHomography: invHomographyArray
    };
  } catch (err) {
    console.error('Error calculating homography matrices:', err);
    return { homography: null, invHomography: null };
  }
}

/**
 * Projects real-world coordinates (meters) to screen coordinates (pixels)
 * using the inverse homography matrix.
 */
export function projectMetersToPixels(
  u: number,
  v: number,
  invHomography: number[] | null
): Point | null {
  if (!invHomography) return null;

  const H = invHomography;
  // H is a 3x3 matrix flattened:
  // [ h0, h1, h2,
  //   h3, h4, h5,
  //   h6, h7, h8 ]
  const w = H[6] * u + H[7] * v + H[8];
  if (Math.abs(w) < 1e-6) return null;

  return {
    x: (H[0] * u + H[1] * v + H[2]) / w,
    y: (H[3] * u + H[4] * v + H[5]) / w,
  };
}

/**
 * Projects screen coordinates (pixels) to real-world coordinates (meters)
 * using the homography matrix.
 */
export function projectPixelsToMeters(
  x: number,
  y: number,
  homography: number[] | null
): Point | null {
  if (!homography) return null;

  const H = homography;
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-6) return null;

  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}
