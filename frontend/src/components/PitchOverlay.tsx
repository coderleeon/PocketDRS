'use client';

import React, { useRef, useEffect } from 'react';
import { CalibrationData, Point, LBWDecision } from '@/core/types';
import { PITCH_WIDTH, PITCH_LENGTH } from '@/core/calibration/calibration';

interface PitchOverlayProps {
  calibration: CalibrationData | null;
  pitchOpacity?: number; // 0 to 100
  wicketOpacity?: number; // 0 to 100
  width: number; // Current display width of the video/canvas
  height: number; // Current display height of the video/canvas
  intrinsicWidth?: number; // Intrinsic video width (e.g. 1280)
  intrinsicHeight?: number; // Intrinsic video height (e.g. 720)
  projectMetersToPixels: (u: number, v: number) => Point | null;
  ballPositions?: { frame: number; x: number; y: number }[];
  rawPositions?: { frame: number; x: number; y: number }[];
  currentFrame?: number;
  debugMode?: boolean;
  lbwDecision?: LBWDecision;
}

export default function PitchOverlay({
  calibration,
  pitchOpacity = 40,
  wicketOpacity = 60,
  width,
  height,
  intrinsicWidth = 1280,
  intrinsicHeight = 720,
  projectMetersToPixels,
  ballPositions = [],
  rawPositions = [],
  currentFrame = 9999,
  debugMode = false,
  lbwDecision
}: PitchOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous drawing
    ctx.clearRect(0, 0, width, height);

    if (!calibration) return;

    // Scale calculation from intrinsic video dimensions to current canvas render dimensions
    const scaleX = width / intrinsicWidth;
    const scaleY = height / intrinsicHeight;

    // Helper to scale a point from intrinsic space to display canvas space
    const scalePoint = (pt: Point): Point => ({
      x: pt.x * scaleX,
      y: pt.y * scaleY
    });

    // Helper to project meters and then scale to current canvas dimensions
    const getCanvasPoint = (u: number, v: number): Point | null => {
      const intrinsicPt = projectMetersToPixels(u, v);
      if (!intrinsicPt) return null;
      return scalePoint(intrinsicPt);
    };

    // 1. Draw Pitch Boundary Polygon
    const pFarLeft = getCanvasPoint(0, 0);
    const pFarRight = getCanvasPoint(PITCH_WIDTH, 0);
    const pNearRight = getCanvasPoint(PITCH_WIDTH, PITCH_LENGTH);
    const pNearLeft = getCanvasPoint(0, PITCH_LENGTH);

    if (pFarLeft && pFarRight && pNearRight && pNearLeft) {
      ctx.beginPath();
      ctx.moveTo(pFarLeft.x, pFarLeft.y);
      ctx.lineTo(pFarRight.x, pFarRight.y);
      ctx.lineTo(pNearRight.x, pNearRight.y);
      ctx.lineTo(pNearLeft.x, pNearLeft.y);
      ctx.closePath();

      // Semi-transparent Pitch Fill
      ctx.fillStyle = `rgba(16, 185, 129, ${pitchOpacity / 100 * 0.25})`; // Emerald green tint
      ctx.fill();

      // Pitch Boundary Stroke
      ctx.strokeStyle = `rgba(16, 185, 129, ${pitchOpacity / 100})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 2. Draw Crease Lines (Popping Creases)
    // Batting Popping Crease (1.22m from batsman's wickets Y=20.12, so Y=18.90)
    const pBatLeft = getCanvasPoint(0, 18.90);
    const pBatRight = getCanvasPoint(PITCH_WIDTH, 18.90);
    if (pBatLeft && pBatRight) {
      ctx.beginPath();
      ctx.moveTo(pBatLeft.x, pBatLeft.y);
      ctx.lineTo(pBatRight.x, pBatRight.y);
      ctx.strokeStyle = `rgba(255, 255, 255, ${pitchOpacity / 100 * 0.8})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]); // Dashed line for creases
      ctx.stroke();
      ctx.setLineDash([]); // Reset
    }

    // Bowling Popping Crease (1.22m from bowler's wickets Y=0, so Y=1.22)
    const pBowLeft = getCanvasPoint(0, 1.22);
    const pBowRight = getCanvasPoint(PITCH_WIDTH, 1.22);
    if (pBowLeft && pBowRight) {
      ctx.beginPath();
      ctx.moveTo(pBowLeft.x, pBowLeft.y);
      ctx.lineTo(pBowRight.x, pBowRight.y);
      ctx.strokeStyle = `rgba(255, 255, 255, ${pitchOpacity / 100 * 0.8})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Draw Wicket Box
    const box = calibration.wicketBox;
    const scaledBox = {
      x: box.x * scaleX,
      y: box.y * scaleY,
      w: box.w * scaleX,
      h: box.h * scaleY
    };

    ctx.beginPath();
    ctx.rect(scaledBox.x, scaledBox.y, scaledBox.w, scaledBox.h);
    ctx.fillStyle = `rgba(180, 83, 9, ${wicketOpacity / 100 * 0.2})`; // Maroon/Amber tint
    ctx.fill();
    ctx.strokeStyle = `rgba(180, 83, 9, ${wicketOpacity / 100})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Draw Virtual Stumps (3 vertical stumps + bails) on top of the Wicket Box
    const baseLineY = scaledBox.y + scaledBox.h;
    const stumpWidth = Math.max(2, scaledBox.w / 12);
    const stumpSpacing = scaledBox.w / 4;

    ctx.fillStyle = `rgba(251, 191, 36, ${wicketOpacity / 100})`; // Golden yellow stumps
    
    // Draw 3 stumps (Left, Middle, Right)
    for (let i = 1; i <= 3; i++) {
      const stumpX = scaledBox.x + i * stumpSpacing - stumpWidth / 2;
      const stumpHeight = scaledBox.h * 1.1; // Extend virtual stumps slightly higher
      const stumpY = baseLineY - stumpHeight;

      // Draw Stump rounded rectangle
      ctx.beginPath();
      ctx.roundRect(stumpX, stumpY, stumpWidth, stumpHeight, stumpWidth / 2);
      ctx.fill();
    }

    // Draw Bails (two small bars resting on top of the stumps)
    const bailY = baseLineY - scaledBox.h * 1.1 - 4;
    const bailHeight = Math.max(2, scaledBox.h * 0.08);
    const bailWidth = scaledBox.w * 0.45;

    ctx.fillStyle = `rgba(217, 119, 6, ${wicketOpacity / 100})`;
    // Left Bail
    ctx.beginPath();
    ctx.roundRect(scaledBox.x + scaledBox.w * 0.05, bailY, bailWidth, bailHeight, 1);
    ctx.fill();
    // Right Bail
    ctx.beginPath();
    ctx.roundRect(scaledBox.x + scaledBox.w * 0.5, bailY, bailWidth, bailHeight, 1);
    ctx.fill();

    // 5. Draw Tracked Ball Trajectory Trail
    const activePath = ballPositions.filter(pt => pt.frame <= currentFrame);
    if (activePath.length > 0) {
      ctx.save();
      ctx.beginPath();
      const startPt = scalePoint(activePath[0]);
      ctx.moveTo(startPt.x, startPt.y);
      for (let i = 1; i < activePath.length; i++) {
        const pt = scalePoint(activePath[i]);
        ctx.lineTo(pt.x, pt.y);
      }
      
      // Neon cyan glowing stroke
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(6, 182, 212, 1)';
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // White inner core
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      // Glowing ball head marker
      const headPt = scalePoint(activePath[activePath.length - 1]);
      ctx.save();
      ctx.beginPath();
      ctx.arc(headPt.x, headPt.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#06b6d4';
      ctx.fill();
      ctx.restore();
    }

    // 5.5 Draw Extrapolated Prediction Trail (Version 2)
    if (lbwDecision && lbwDecision.predictedTrajectory && ballPositions.length > 0 && currentFrame > (lbwDecision.impactFrame ?? 0)) {
      const activeProj = lbwDecision.predictedTrajectory.filter(pt => pt.frame <= currentFrame);
      if (activeProj.length > 0) {
        ctx.save();
        ctx.beginPath();
        // Start from last tracked point (the impact point)
        const lastTrackedPt = scalePoint(ballPositions[ballPositions.length - 1]);
        ctx.moveTo(lastTrackedPt.x, lastTrackedPt.y);
        
        for (const pt of activeProj) {
          const scaledPt = scalePoint(pt);
          ctx.lineTo(scaledPt.x, scaledPt.y);
        }
        
        // Amber/yellow dashed glowing stroke
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(245, 158, 11, 1)'; // Amber
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.restore();
        
        // Draw the target circle if we've reached the end of the predicted path (the stumps line)
        const lastProjPt = activeProj[activeProj.length - 1];
        const lastExpectedPt = lbwDecision.predictedTrajectory[lbwDecision.predictedTrajectory.length - 1];
        const isLastFrame = lastProjPt.frame === lastExpectedPt.frame;
        
        if (isLastFrame) {
          const targetPt = scalePoint(lastProjPt);
          ctx.save();
          ctx.beginPath();
          ctx.arc(targetPt.x, targetPt.y, 7, 0, Math.PI * 2);
          
          if (lbwDecision.decision === 'HITTING') {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'; // Red hitting
            ctx.strokeStyle = '#ef4444';
            ctx.shadowColor = 'rgba(239, 68, 68, 1)';
          } else {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.85)'; // Green missing
            ctx.strokeStyle = '#10b981';
            ctx.shadowColor = 'rgba(16, 185, 129, 1)';
          }
          
          ctx.lineWidth = 2;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.stroke();
          
          // Draw a small cross inside the target circle
          ctx.beginPath();
          ctx.moveTo(targetPt.x - 3, targetPt.y);
          ctx.lineTo(targetPt.x + 3, targetPt.y);
          ctx.moveTo(targetPt.x, targetPt.y - 3);
          ctx.lineTo(targetPt.x, targetPt.y + 3);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          ctx.restore();
        }
      }
    }

    // 6. Draw Debug Centroids Crosshairs
    if (debugMode && rawPositions.length > 0) {
      ctx.save();
      for (const pt of rawPositions) {
        const displayPt = scalePoint(pt);

        // Draw crosshair
        ctx.strokeStyle = '#ef4444'; // Red color
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(displayPt.x - 5, displayPt.y);
        ctx.lineTo(displayPt.x + 5, displayPt.y);
        ctx.moveTo(displayPt.x, displayPt.y - 5);
        ctx.lineTo(displayPt.x, displayPt.y + 5);
        ctx.stroke();

        // Label frame count
        ctx.fillStyle = '#ef4444';
        ctx.font = '8px monospace';
        ctx.fillText(`f:${pt.frame}`, displayPt.x + 7, displayPt.y - 3);
      }
      ctx.restore();
    }

  }, [calibration, pitchOpacity, wicketOpacity, width, height, intrinsicWidth, intrinsicHeight, projectMetersToPixels, ballPositions, rawPositions, currentFrame, debugMode, lbwDecision]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
    />
  );
}
