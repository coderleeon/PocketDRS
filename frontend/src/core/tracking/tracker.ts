import { Point, TrajectoryPoint, CalibrationData } from '@/core/types';
import { pointInPolygon, fitQuadraticCurve } from '@/core/geometry/geom';

export interface TrackingResult {
  fps: number;
  ballPositions: TrajectoryPoint[];
  rawPositions: TrajectoryPoint[];
}

export interface DebugCanvasElements {
  motion?: HTMLCanvasElement | null;
  color?: HTMLCanvasElement | null;
  final?: HTMLCanvasElement | null;
}

/**
 * Executes the frame-by-frame ball tracking pipeline using OpenCV.js.
 * This function is fully decoupled from React and is designed to run in any JS environment with DOM access.
 */
export async function trackBallInVideo(
  videoBlob: Blob,
  calibration: CalibrationData | null,
  ballColor: 'red' | 'white' | 'neon',
  options?: {
    onProgress?: (progress: number) => void;
    onCancelCheck?: () => boolean;
    debugCanvases?: DebugCanvasElements;
  }
): Promise<TrackingResult | null> {
  if (!window.cv || !window.cv.Mat) {
    throw new Error('OpenCV.js is not initialized.');
  }

  const cv = window.cv;
  const fps = 30; // Standard capture frame rate fallback
  const frameInterval = 1 / fps;

  // Create temporary offscreen video element
  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(videoBlob);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;

  // Wait for metadata to load
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video file.'));
  });

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  const duration = video.duration;
  const totalFrames = Math.floor(duration * fps);

  if (videoWidth === 0 || videoHeight === 0 || duration === 0) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Invalid video dimensions or duration.');
  }

  // Offline canvas for frame-by-frame rendering
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = videoWidth;
  frameCanvas.height = videoHeight;
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

  if (!frameCtx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Could not get 2D canvas context.');
  }

  // Initialize persistent OpenCV Mats (outside the seek loop to avoid reallocation)
  const prevGray = new cv.Mat();
  const pitchMask = new cv.Mat.zeros(videoHeight, videoWidth, cv.CV_8UC1);

  // Create Pitch Corridor Mask if calibrated
  if (calibration && calibration.pitchPoints.length === 4) {
    const ptsVec = new cv.IntVector();
    calibration.pitchPoints.forEach(pt => {
      ptsVec.push_back(pt.x);
      ptsVec.push_back(pt.y);
    });
    cv.fillPoly(pitchMask, ptsVec, new cv.Scalar(255));
    ptsVec.delete();
  } else {
    // Default to full frame
    pitchMask.setTo(new cv.Scalar(255));
  }

  // Define HSV range limits
  let lowHSV1 = new cv.Mat();
  let highHSV1 = new cv.Mat();
  let lowHSV2 = new cv.Mat();
  let highHSV2 = new cv.Mat();
  let useDualRange = false;

  if (ballColor === 'red') {
    // Red wraps around 0 and 180 hue
    lowHSV1 = cv.matFromArray(3, 1, cv.CV_8UC1, [0, 60, 40]);
    highHSV1 = cv.matFromArray(3, 1, cv.CV_8UC1, [15, 255, 255]);
    lowHSV2 = cv.matFromArray(3, 1, cv.CV_8UC1, [165, 60, 40]);
    highHSV2 = cv.matFromArray(3, 1, cv.CV_8UC1, [180, 255, 255]);
    useDualRange = true;
  } else if (ballColor === 'neon') {
    // Neon green / yellow tennis ball
    lowHSV1 = cv.matFromArray(3, 1, cv.CV_8UC1, [25, 50, 60]);
    highHSV1 = cv.matFromArray(3, 1, cv.CV_8UC1, [85, 255, 255]);
  } else {
    // White ball (high value/brightness, low saturation)
    lowHSV1 = cv.matFromArray(3, 1, cv.CV_8UC1, [0, 0, 160]);
    highHSV1 = cv.matFromArray(3, 1, cv.CV_8UC1, [180, 50, 255]);
  }

  const detectedCentroids: TrajectoryPoint[] = [];

  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (options?.onCancelCheck && options.onCancelCheck()) {
        break;
      }

      // Seek video frame
      video.currentTime = frameIdx * frameInterval;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      // Draw video frame to offline canvas
      frameCtx.drawImage(video, 0, 0, videoWidth, videoHeight);

      // Read frame in OpenCV
      const srcFrame = cv.imread(frameCanvas);
      const maskedFrame = new cv.Mat();
      
      // 1. Restrict tracking strictly to calibrated pitch corridor
      cv.bitwise_and(srcFrame, srcFrame, maskedFrame, pitchMask);

      // 2. Grayscale & Motion Detection
      const currGray = new cv.Mat();
      cv.cvtColor(maskedFrame, currGray, cv.COLOR_RGBA2GRAY);

      const motionMask = new cv.Mat();
      if (frameIdx === 0) {
        currGray.copyTo(prevGray);
        motionMask.setTo(new cv.Scalar(0));
      } else {
        const diffFrame = new cv.Mat();
        cv.absdiff(currGray, prevGray, diffFrame);
        cv.threshold(diffFrame, motionMask, 20, 255, cv.THRESH_BINARY);
        
        const ksize = new cv.Size(3, 3);
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, ksize);
        cv.morphologyEx(motionMask, motionMask, cv.MORPH_OPEN, kernel);
        kernel.delete();
        
        diffFrame.delete();
      }
      currGray.copyTo(prevGray);

      // 3. Color Masking (HSV Space)
      const hsvFrame = new cv.Mat();
      cv.cvtColor(maskedFrame, hsvFrame, cv.COLOR_RGBA2RGB);
      cv.cvtColor(hsvFrame, hsvFrame, cv.COLOR_RGB2HSV);

      const colorMask = new cv.Mat();
      if (useDualRange) {
        const tempMask1 = new cv.Mat();
        const tempMask2 = new cv.Mat();
        cv.inRange(hsvFrame, lowHSV1, highHSV1, tempMask1);
        cv.inRange(hsvFrame, lowHSV2, highHSV2, tempMask2);
        cv.bitwise_or(tempMask1, tempMask2, colorMask);
        tempMask1.delete();
        tempMask2.delete();
      } else {
        cv.inRange(hsvFrame, lowHSV1, highHSV1, colorMask);
      }

      // 4. LOGIC INTERSECTION: Motion AND Color Mask
      const finalMask = new cv.Mat();
      cv.bitwise_and(motionMask, colorMask, finalMask);

      // 5. Contour Filtering
      const hierarchy = new cv.Mat();
      const contoursList = new cv.MatVector();
      cv.findContours(finalMask, contoursList, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let bestCentroid: Point | null = null;
      let bestCircularity = 0;

      for (let i = 0; i < contoursList.size(); ++i) {
        const cnt = contoursList.get(i);
        const area = cv.contourArea(cnt);
        const perimeter = cv.arcLength(cnt, true);

        if (area > 8 && area < 500) {
          const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
          
          if (circularity > 0.45 && circularity > bestCircularity) {
            const M = cv.moments(cnt);
            if (M.m00 > 0) {
              const cx = M.m10 / M.m00;
              const cy = M.m01 / M.m00;
              
              let inCorridor = true;
              if (calibration && calibration.pitchPoints.length === 4) {
                inCorridor = pointInPolygon({ x: cx, y: cy }, calibration.pitchPoints);
              }

              if (inCorridor) {
                bestCentroid = { x: cx, y: cy };
                bestCircularity = circularity;
              }
            }
          }
        }
        cnt.delete();
      }

      if (bestCentroid) {
        detectedCentroids.push({
          frame: frameIdx,
          x: bestCentroid.x,
          y: bestCentroid.y
        });
      }

      // 6. Draw debug diagnostics if canvases are available
      if (options?.debugCanvases) {
        const { motion, color, final } = options.debugCanvases;
        if (motion) cv.imshow(motion, motionMask);
        if (color) cv.imshow(color, colorMask);
        if (final) cv.imshow(final, finalMask);
      }

      // Cleanup frame structures
      srcFrame.delete();
      maskedFrame.delete();
      currGray.delete();
      motionMask.delete();
      hsvFrame.delete();
      colorMask.delete();
      finalMask.delete();
      contoursList.delete();
      hierarchy.delete();

      // Report progress
      if (options?.onProgress) {
        options.onProgress(Math.round(((frameIdx + 1) / totalFrames) * 100));
      }
    }

    // --- POST-PROCESSING: Trajectory curve smoothing ---
    let filteredTrajectory: TrajectoryPoint[] = [];

    if (detectedCentroids.length >= 3) {
      const xSeries = detectedCentroids.map(pt => ({ t: pt.frame, val: pt.x }));
      const ySeries = detectedCentroids.map(pt => ({ t: pt.frame, val: pt.y }));

      const coeffX = fitQuadraticCurve(xSeries);
      const coeffY = fitQuadraticCurve(ySeries);

      if (coeffX && coeffY) {
        const firstFrame = detectedCentroids[0].frame;
        const lastFrame = detectedCentroids[detectedCentroids.length - 1].frame;

        for (let f = firstFrame; f <= lastFrame; f++) {
          const rx = coeffX.a * f * f + coeffX.b * f + coeffX.c;
          const ry = coeffY.a * f * f + coeffY.b * f + coeffY.c;

          filteredTrajectory.push({
            frame: f,
            x: Math.max(0, Math.min(videoWidth, rx)),
            y: Math.max(0, Math.min(videoHeight, ry))
          });
        }
      } else {
        filteredTrajectory = [...detectedCentroids];
      }
    } else {
      filteredTrajectory = [...detectedCentroids];
    }

    URL.revokeObjectURL(objectUrl);
    return {
      fps,
      ballPositions: filteredTrajectory,
      rawPositions: detectedCentroids
    };
  } catch (err: unknown) {
    console.error('Error in core tracking pipeline: ', err);
    URL.revokeObjectURL(objectUrl);
    throw err;
  } finally {
    prevGray.delete();
    pitchMask.delete();
    lowHSV1.delete();
    highHSV1.delete();
    lowHSV2.delete();
    highHSV2.delete();
  }
}
