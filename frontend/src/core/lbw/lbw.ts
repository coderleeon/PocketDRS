import { CalibrationData, LBWDecision, TrajectoryPoint } from '@/core/types';
import { fitQuadraticCurve } from '@/core/geometry/geom';
import { projectPixelsToMeters } from '@/core/calibration/calibration';

/**
 * Version 2 Wicket Hitting Prediction Engine.
 * Detects the bounce frame, detects the pad impact frame, fits the post-bounce flight path,
 * projects it to the stumps plane (20.12m), and checks for stump collision.
 */
export function checkLBWDecision(
  calibration: CalibrationData | null,
  ballPositions: TrajectoryPoint[]
): LBWDecision {
  if (!calibration || ballPositions.length < 3) {
    return { decision: 'UNKNOWN', trajectoryConfidence: 0 };
  }

  // Sort ball positions by frame to guarantee chronological order
  const sortedPositions = [...ballPositions].sort((a, b) => a.frame - b.frame);
  const totalPoints = sortedPositions.length;

  // 1. DETECT BOUNCE FRAME
  // We search for bounce in the middle section of the delivery (between 15% and 80%)
  let maxDdy = 0;
  let bounceIdx = -1;
  const startSection = Math.floor(totalPoints * 0.15);
  const endSection = Math.floor(totalPoints * 0.8);

  for (let i = Math.max(2, startSection); i <= Math.min(totalPoints - 1, endSection); i++) {
    const p0 = sortedPositions[i - 2];
    const p1 = sortedPositions[i - 1];
    const p2 = sortedPositions[i];
    
    // Vertical differences (pixel coordinate Y)
    const dy1 = p1.y - p0.y;
    const dy2 = p2.y - p1.y;
    const ddy = Math.abs(dy2 - dy1); // Second derivative magnitude
    
    if (ddy > maxDdy) {
      maxDdy = ddy;
      bounceIdx = i - 1; // Inflection frame index
    }
  }

  // Fallback if no clear bounce inflection is found
  if (bounceIdx === -1) {
    bounceIdx = Math.floor(totalPoints / 2);
  }

  // 2. ESTIMATE IMPACT FRAME
  // The impact happens after the bounce. We search for sudden deceleration or direction changes.
  let impactIdx = totalPoints - 1;
  let maxDecel = 0;

  for (let i = bounceIdx + 2; i < totalPoints - 1; i++) {
    const p0 = sortedPositions[i - 2];
    const p1 = sortedPositions[i - 1];
    const p2 = sortedPositions[i];

    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;

    const speed1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const speed2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    const decel = speed1 - speed2;

    if (decel > maxDecel && speed1 > 2) {
      maxDecel = decel;
      impactIdx = i - 1;
    }
  }

  // Ensure impact is strictly after bounce
  if (impactIdx <= bounceIdx) {
    impactIdx = Math.min(totalPoints - 1, bounceIdx + 3);
  }

  const bouncePoint = sortedPositions[bounceIdx];
  const impactPoint = sortedPositions[impactIdx];

  // Map bounce and impact points to real-world ground meters
  const bounceMeters = projectPixelsToMeters(bouncePoint.x, bouncePoint.y, calibration.homography);
  const impactMeters = projectPixelsToMeters(impactPoint.x, impactPoint.y, calibration.homography);

  // 3. FIT POST-BOUNCE TRAJECTORY
  // Extract tracking points in the post-bounce phase
  const postBouncePoints = sortedPositions.slice(bounceIdx, impactIdx + 1);
  const xSeries = postBouncePoints.map(pt => ({ t: pt.frame, val: pt.x }));
  const ySeries = postBouncePoints.map(pt => ({ t: pt.frame, val: pt.y }));

  const coeffX = fitQuadraticCurve(xSeries);
  const coeffY = fitQuadraticCurve(ySeries);

  // Fallback linear equations if quadratic fit fails (requires at least 3 points)
  let isLinearFallback = false;
  let linearX = { m: 0, c: 0 };
  let linearY = { m: 0, c: 0 };

  if (!coeffX || !coeffY) {
    isLinearFallback = true;
    if (postBouncePoints.length >= 2) {
      const pFirst = postBouncePoints[0];
      const pLast = postBouncePoints[postBouncePoints.length - 1];
      const df = pLast.frame - pFirst.frame || 1;
      
      linearX = { m: (pLast.x - pFirst.x) / df, c: pFirst.x - ((pLast.x - pFirst.x) / df) * pFirst.frame };
      linearY = { m: (pLast.y - pFirst.y) / df, c: pFirst.y - ((pLast.y - pFirst.y) / df) * pFirst.frame };
    } else {
      // Complete fallback using velocity over the whole delivery
      const pFirst = sortedPositions[0];
      const pLast = sortedPositions[totalPoints - 1];
      const df = pLast.frame - pFirst.frame || 1;
      
      linearX = { m: (pLast.x - pFirst.x) / df, c: pFirst.x };
      linearY = { m: (pLast.y - pFirst.y) / df, c: pFirst.y };
    }
  }

  // 4. PREDICT FUTURE TRAJECTORY TO STUMPS DEPTH
  // The wickets are at Y = 20.12m
  const stumpsDepth = 20.12;
  const V_bounce = bounceMeters?.y ?? 10.0;
  const V_impact = impactMeters?.y ?? 18.0;

  // Real-world speed along the pitch axis (meters per frame)
  let speedV = (V_impact - V_bounce) / (impactPoint.frame - bouncePoint.frame || 1);
  if (speedV <= 0.05) {
    // Default fallback velocity (0.4m per frame corresponds to ~40-50 km/h at 30fps)
    speedV = 0.4;
  }

  // Calculate projected frame when ball crosses the stumps line
  const framesFromBounceToStumps = (stumpsDepth - V_bounce) / speedV;
  const t_stumps = Math.round(bouncePoint.frame + framesFromBounceToStumps);

  const predictedTrajectory: TrajectoryPoint[] = [];
  const startFrame = impactPoint.frame + 1;
  const endFrame = Math.max(startFrame + 2, t_stumps);

  // Extrapolate frame-by-frame
  for (let f = startFrame; f <= endFrame; f++) {
    let px = 0;
    let py = 0;

    if (isLinearFallback) {
      px = linearX.m * f + linearX.c;
      py = linearY.m * f + linearY.c;
    } else if (coeffX && coeffY) {
      px = coeffX.a * f * f + coeffX.b * f + coeffX.c;
      py = coeffY.a * f * f + coeffY.b * f + coeffY.c;
    }

    predictedTrajectory.push({
      frame: f,
      x: px,
      y: py
    });
  }

  // 5. STUMPS INTERSECTION CHECK
  const stumpsFrame = predictedTrajectory.find(pt => pt.frame === t_stumps) || predictedTrajectory[predictedTrajectory.length - 1];
  const wBox = calibration.wicketBox;
  const stumpHeight = wBox.h * 1.1; // Extend height to include stumps + bails

  const x_left = wBox.x;
  const x_right = wBox.x + wBox.w;
  const y_top = wBox.y - stumpHeight;
  const y_bottom = wBox.y + wBox.h;

  const hitsStumpsHorizontal = stumpsFrame.x >= x_left && stumpsFrame.x <= x_right;
  const hitsStumpsVertical = stumpsFrame.y >= y_top && stumpsFrame.y <= y_bottom;
  const decision = (hitsStumpsHorizontal && hitsStumpsVertical) ? 'HITTING' : 'MISSING';

  // 6. TRAJECTORY CONFIDENCE SCORE
  let confidence = 100;

  // Deduct score if too few tracked points overall
  if (totalPoints < 12) {
    confidence -= (12 - totalPoints) * 5;
  }
  // Deduct score if post-bounce flight is too short (unreliable extrapolation)
  const postBounceCount = impactIdx - bounceIdx;
  if (postBounceCount < 4) {
    confidence -= (4 - postBounceCount) * 15;
  }
  // Deduct score if linear fallback was used instead of quadratic curve fit
  if (isLinearFallback) {
    confidence -= 20;
  }

  const finalConfidence = Math.max(15, Math.min(100, confidence));

  return {
    decision,
    bounceFrame: bouncePoint.frame,
    bouncePoint: { x: bouncePoint.x, y: bouncePoint.y },
    bouncePointMeters: bounceMeters || undefined,
    impactFrame: impactPoint.frame,
    impactPoint: { x: impactPoint.x, y: impactPoint.y },
    impactPointMeters: impactMeters || undefined,
    trajectoryConfidence: finalConfidence,
    predictedTrajectory
  };
}

/**
 * Predicts the continuation of the trajectory past the impact point. (Retained signature)
 */
export function predictFuturePath(): TrajectoryPoint[] {
  return [];
}
