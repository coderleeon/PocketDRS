'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Point, WicketBox } from '@/core/types';
import { calculateAlignmentConfidence } from '@/core/geometry/geom';

interface CalibrationWorkspaceProps {
  capturedCanvas: HTMLCanvasElement; // The captured image frame
  initialPoints?: Point[];
  initialWicketBox?: WicketBox;
  onSave: (points: Point[], wicketBox: WicketBox) => void;
  onCancel: () => void;
  openCvLoaded: boolean;
}

export default function CalibrationWorkspace({
  capturedCanvas,
  initialPoints,
  initialWicketBox,
  onSave,
  onCancel,
  openCvLoaded
}: CalibrationWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  // Calibration points in intrinsic canvas space (e.g. 1280x720)
  const [points, setPoints] = useState<Point[]>([]);
  const [wicketBoxPoints, setWicketBoxPoints] = useState<{ w0: Point; w1: Point }>({
    w0: { x: 0, y: 0 },
    w1: { x: 0, y: 0 }
  });

  const [activeHandle, setActiveHandle] = useState<number | 'w0' | 'w1' | null>(null);
  const [selectedHandle, setSelectedHandle] = useState<number | 'w0' | 'w1' | null>(null);
  const [nudgeStep, setNudgeStep] = useState<1 | 5>(1);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [workspaceDims, setWorkspaceDims] = useState({ width: 0, height: 0 });
  
  // Magnifier loupe state
  const [loupePos, setLoupePos] = useState<Point | null>(null);
  const loupeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const intrinsicWidth = capturedCanvas.width;
  const intrinsicHeight = capturedCanvas.height;

  // Initialize points and fit layout
  useEffect(() => {
    // Sensible defaults in intrinsic space
    const defaultPoints = [
      { x: intrinsicWidth * 0.35, y: intrinsicHeight * 0.3 }, // Far-Left (0)
      { x: intrinsicWidth * 0.65, y: intrinsicHeight * 0.3 }, // Far-Right (1)
      { x: intrinsicWidth * 0.8, y: intrinsicHeight * 0.8 },  // Near-Right (2)
      { x: intrinsicWidth * 0.2, y: intrinsicHeight * 0.8 }   // Near-Left (3)
    ];

    const defaultWicket = {
      w0: { x: intrinsicWidth * 0.47, y: intrinsicHeight * 0.23 }, // Top-Left
      w1: { x: intrinsicWidth * 0.53, y: intrinsicHeight * 0.35 }  // Bottom-Right
    };

    Promise.resolve().then(() => {
      if (initialPoints && initialPoints.length === 4) {
        setPoints([...initialPoints]);
      } else {
        setPoints(defaultPoints);
      }

      if (initialWicketBox) {
        setWicketBoxPoints({
          w0: { x: initialWicketBox.x, y: initialWicketBox.y },
          w1: { x: initialWicketBox.x + initialWicketBox.w, y: initialWicketBox.y + initialWicketBox.h }
        });
      } else {
        setWicketBoxPoints(defaultWicket);
      }
    });

    // Set up workspace dimensions
    const updateWorkspaceSize = () => {
      if (containerRef.current) {
        const container = containerRef.current;
        // Keep the aspect ratio of the captured canvas
        const aspect = intrinsicWidth / intrinsicHeight;
        let w = container.clientWidth;
        let h = w / aspect;
        
        if (h > container.clientHeight) {
          h = container.clientHeight;
          w = h * aspect;
        }

        setWorkspaceDims({ width: w, height: h });
      }
    };

    updateWorkspaceSize();
    window.addEventListener('resize', updateWorkspaceSize);
    return () => window.removeEventListener('resize', updateWorkspaceSize);
  }, [capturedCanvas, intrinsicWidth, intrinsicHeight, initialPoints, initialWicketBox]);

  // Draw captured static frame onto the workspace background canvas
  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (canvas && workspaceDims.width > 0) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, workspaceDims.width, workspaceDims.height);
        ctx.drawImage(capturedCanvas, 0, 0, workspaceDims.width, workspaceDims.height);
      }
    }
  }, [capturedCanvas, workspaceDims]);

  // Scale variables
  const scaleX = workspaceDims.width / intrinsicWidth;
  const scaleY = workspaceDims.height / intrinsicHeight;

  // Convert intrinsic coordinates to display screen pixels
  const toDisplay = (pt: Point): Point => ({
    x: pt.x * scaleX,
    y: pt.y * scaleY
  });

  // Convert display screen pixels to intrinsic coordinates
  const toIntrinsic = (pt: Point): Point => ({
    x: Math.max(0, Math.min(intrinsicWidth, pt.x / scaleX)),
    y: Math.max(0, Math.min(intrinsicHeight, pt.y / scaleY))
  });

  // Handle Drag / Pointer actions
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: number | 'w0' | 'w1', pt: Point) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent background deselect
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const clientRect = containerRef.current?.getBoundingClientRect();
    if (!clientRect) return;

    // Click point in workspace space
    const clickX = e.clientX - clientRect.left;
    const clickY = e.clientY - clientRect.top;

    const displayPt = toDisplay(pt);

    setActiveHandle(id);
    setSelectedHandle(id); // Set selected persistent handle
    setDragOffset({
      x: clickX - displayPt.x,
      y: clickY - displayPt.y
    });

    updateLoupe(clickX, clickY, pt);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeHandle === null) return;

    const clientRect = containerRef.current?.getBoundingClientRect();
    if (!clientRect) return;

    const clickX = e.clientX - clientRect.left;
    const clickY = e.clientY - clientRect.top;

    // Target display coordinate based on cursor and initial grab offset
    const targetDisplay = {
      x: clickX - dragOffset.x,
      y: clickY - dragOffset.y
    };

    const targetIntrinsic = toIntrinsic(targetDisplay);

    if (typeof activeHandle === 'number') {
      setPoints(prev => {
        const next = [...prev];
        next[activeHandle] = targetIntrinsic;
        return next;
      });
      updateLoupe(clickX, clickY, targetIntrinsic);
    } else if (activeHandle === 'w0') {
      setWicketBoxPoints(prev => ({
        ...prev,
        w0: targetIntrinsic
      }));
      updateLoupe(clickX, clickY, targetIntrinsic);
    } else if (activeHandle === 'w1') {
      setWicketBoxPoints(prev => ({
        ...prev,
        w1: targetIntrinsic
      }));
      updateLoupe(clickX, clickY, targetIntrinsic);
    }
  };

  const handlePointerUp = () => {
    setActiveHandle(null);
    setLoupePos(null);
  };

  const handleBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'CANVAS' ||
      target.tagName === 'svg' ||
      target.tagName === 'polygon' ||
      target.tagName === 'rect' ||
      target.id === 'workspace-container'
    ) {
      setSelectedHandle(null);
    }
  };

  // Render the magnifying loupe
  const updateLoupe = React.useCallback((screenX: number, screenY: number, intPt: Point) => {
    setLoupePos({ x: screenX, y: screenY });

    const canvas = loupeCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear loupe canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Capture small window from raw image (e.g. 50x50 size)
    const viewSize = 50;
    const halfView = viewSize / 2;
    const sourceX = intPt.x - halfView;
    const sourceY = intPt.y - halfView;

    // Draw the zoomed sub-rectangle onto the loupe canvas (e.g. size 120x120)
    ctx.save();
    
    // Draw rounded clipping mask for magnifying circle
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      capturedCanvas,
      sourceX,
      sourceY,
      viewSize,
      viewSize,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Draw crosshair
    ctx.strokeStyle = '#ef4444'; // Red line
    ctx.lineWidth = 1.5;
    // Horizontal crosshair
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    // Vertical crosshair
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();

    ctx.restore();

    // Draw border around circle
    ctx.strokeStyle = '#4f46e5'; // Indigo border
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }, [capturedCanvas]);

  // Nudge selected handle by a direction and amount in pixels
  const nudgeHandle = React.useCallback((dir: 'up' | 'down' | 'left' | 'right', amount: number = 1) => {
    if (selectedHandle === null) return;

    let targetPt: Point;

    if (typeof selectedHandle === 'number') {
      setPoints(prev => {
        const next = [...prev];
        const pt = next[selectedHandle];
        const newPt = { ...pt };
        if (dir === 'up') newPt.y = Math.max(0, pt.y - amount);
        else if (dir === 'down') newPt.y = Math.min(intrinsicHeight, pt.y + amount);
        else if (dir === 'left') newPt.x = Math.max(0, pt.x - amount);
        else if (dir === 'right') newPt.x = Math.min(intrinsicWidth, pt.x + amount);
        next[selectedHandle] = newPt;
        
        targetPt = newPt;
        // Schedule loupe draw
        const displayPt = {
          x: targetPt.x * scaleX,
          y: targetPt.y * scaleY
        };
        if (loupeTimeoutRef.current) clearTimeout(loupeTimeoutRef.current);
        updateLoupe(displayPt.x, displayPt.y, targetPt);
        loupeTimeoutRef.current = setTimeout(() => {
          setLoupePos(null);
        }, 1500);

        return next;
      });
    } else {
      setWicketBoxPoints(prev => {
        const next = { ...prev };
        const pt = next[selectedHandle];
        const newPt = { ...pt };
        if (dir === 'up') newPt.y = Math.max(0, pt.y - amount);
        else if (dir === 'down') newPt.y = Math.min(intrinsicHeight, pt.y + amount);
        else if (dir === 'left') newPt.x = Math.max(0, pt.x - amount);
        else if (dir === 'right') newPt.x = Math.min(intrinsicWidth, pt.x + amount);
        next[selectedHandle] = newPt;

        targetPt = newPt;
        // Schedule loupe draw
        const displayPt = {
          x: targetPt.x * scaleX,
          y: targetPt.y * scaleY
        };
        if (loupeTimeoutRef.current) clearTimeout(loupeTimeoutRef.current);
        updateLoupe(displayPt.x, displayPt.y, targetPt);
        loupeTimeoutRef.current = setTimeout(() => {
          setLoupePos(null);
        }, 1500);

        return next;
      });
    }
  }, [selectedHandle, intrinsicWidth, intrinsicHeight, scaleX, scaleY, updateLoupe]);

  // Keyboard nudge integration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedHandle === null) return;
      
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!keys.includes(e.key)) return;
      
      e.preventDefault(); // Stop window scrolls
      
      const amount = e.shiftKey ? 5 : 1;
      let dir: 'up' | 'down' | 'left' | 'right' = 'up';
      
      if (e.key === 'ArrowUp') dir = 'up';
      else if (e.key === 'ArrowDown') dir = 'down';
      else if (e.key === 'ArrowLeft') dir = 'left';
      else if (e.key === 'ArrowRight') dir = 'right';
      
      nudgeHandle(dir, amount);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedHandle, nudgeHandle]);

  // Safe packaging of coordinates for saving
  const handleSave = () => {
    // Derive WicketBox (x, y, w, h)
    const { w0, w1 } = wicketBoxPoints;
    const x = Math.min(w0.x, w1.x);
    const y = Math.min(w0.y, w1.y);
    const w = Math.abs(w1.x - w0.x);
    const h = Math.abs(w1.y - w0.y);

    onSave(points, { x, y, w, h });
  };

  // Evaluate alignment confidence metrics in real-time
  const alignmentAnalysis = calculateAlignmentConfidence(points, intrinsicWidth, intrinsicHeight);

  // Wicket display coordinates
  const displayW0 = toDisplay(wicketBoxPoints.w0);
  const displayW1 = toDisplay(wicketBoxPoints.w1);

  return (
    <div className="absolute inset-0 bg-slate-950 flex flex-col z-40 select-none">
      {/* Top HUD for calibration feedback */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-white backdrop-blur-md">
        <div>
          <h2 className="font-bold text-sm">Pitch Calibration Studio</h2>
          <p className="text-xs text-slate-400">Drag points to align corners and wicket marker.</p>
        </div>
        
        {/* Real-time confidence metrics */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400">Confidence</span>
            <span className={`text-sm font-bold ${
              alignmentAnalysis.status === 'excellent' ? 'text-emerald-400' :
              alignmentAnalysis.status === 'good' ? 'text-teal-400' :
              alignmentAnalysis.status === 'fair' ? 'text-amber-400' : 'text-red-400'
            }`}>
              {alignmentAnalysis.confidence}% ({alignmentAnalysis.status.toUpperCase()})
            </span>
          </div>
          <div className={`w-3 h-3 rounded-full ${
            alignmentAnalysis.status === 'excellent' ? 'bg-emerald-500' :
            alignmentAnalysis.status === 'good' ? 'bg-teal-500' :
            alignmentAnalysis.status === 'fair' ? 'bg-amber-500' : 'bg-red-500'
          }`} />
        </div>
      </div>

      {/* Main Calibration Window */}
      <div 
        ref={containerRef} 
        id="workspace-container"
        className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden pointer-events-auto"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div 
          className="relative shadow-2xl overflow-hidden border border-slate-800"
          style={{ width: workspaceDims.width, height: workspaceDims.height }}
        >
          {/* Captured Canvas Frame (rendered scaled) */}
          <canvas
            ref={imageCanvasRef}
            width={workspaceDims.width}
            height={workspaceDims.height}
            className="absolute top-0 left-0 w-full h-full"
          />

          {/* SVG Connector Lines (render overlays on top) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {points.length === 4 && (
              <>
                {/* Outer pitch polygon */}
                <polygon
                  points={`${toDisplay(points[0]).x},${toDisplay(points[0]).y} ${toDisplay(points[1]).x},${toDisplay(points[1]).y} ${toDisplay(points[2]).x},${toDisplay(points[2]).y} ${toDisplay(points[3]).x},${toDisplay(points[3]).y}`}
                  fill="rgba(16, 185, 129, 0.15)"
                  stroke="rgba(16, 185, 129, 0.7)"
                  strokeWidth="2"
                />
                
                {/* Index indicators */}
                <text x={toDisplay(points[0]).x - 10} y={toDisplay(points[0]).y - 12} fill="#6ee7b7" fontSize="10" fontWeight="bold">Far-L (0)</text>
                <text x={toDisplay(points[1]).x + 10} y={toDisplay(points[1]).y - 12} fill="#6ee7b7" fontSize="10" fontWeight="bold">Far-R (1)</text>
                <text x={toDisplay(points[2]).x + 10} y={toDisplay(points[2]).y + 20} fill="#6ee7b7" fontSize="10" fontWeight="bold">Near-R (2)</text>
                <text x={toDisplay(points[3]).x - 10} y={toDisplay(points[3]).y + 20} fill="#6ee7b7" fontSize="10" fontWeight="bold">Near-L (3)</text>
              </>
            )}

            {/* Wicket cardboard box border */}
            <rect
              x={Math.min(displayW0.x, displayW1.x)}
              y={Math.min(displayW0.y, displayW1.y)}
              width={Math.abs(displayW1.x - displayW0.x)}
              height={Math.abs(displayW1.y - displayW0.y)}
              fill="rgba(245, 158, 11, 0.1)"
              stroke="rgba(245, 158, 11, 0.8)"
              strokeWidth="2"
            />
            <text
              x={Math.min(displayW0.x, displayW1.x)}
              y={Math.min(displayW0.y, displayW1.y) - 10}
              fill="#fcd34d"
              fontSize="10"
              fontWeight="bold"
            >
              Wicket Box
            </text>
          </svg>

          {/* Interactive Drag Handles */}
          {/* Pitch Handles (Green) */}
          {points.map((pt, index) => {
            const displayPt = toDisplay(pt);
            return (
              <div
                key={`pitch-handle-${index}`}
                onPointerDown={(e) => handlePointerDown(e, index, pt)}
                className={`absolute w-10 h-10 rounded-full cursor-pointer flex items-center justify-center z-20 transition hover:scale-110 active:scale-95 touch-none ${
                  selectedHandle === index 
                    ? 'ring-4 ring-indigo-500 ring-offset-2 ring-offset-slate-950 scale-110' 
                    : ''
                }`}
                style={{
                  left: displayPt.x - 20,
                  top: displayPt.y - 20,
                }}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border border-white shadow-md transition ${
                  selectedHandle === index
                    ? 'bg-indigo-500 text-white font-black'
                    : 'bg-emerald-500/80 text-white font-bold'
                }`}>
                  <span className="text-[10px]">{index}</span>
                </div>
              </div>
            );
          })}

          {/* Wicket Handles (Yellow/Amber) */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'w0', wicketBoxPoints.w0)}
            className={`absolute w-10 h-10 rounded-full cursor-pointer flex items-center justify-center z-20 transition hover:scale-110 active:scale-95 touch-none ${
              selectedHandle === 'w0'
                ? 'ring-4 ring-indigo-500 ring-offset-2 ring-offset-slate-950 scale-110'
                : ''
            }`}
            style={{
              left: displayW0.x - 20,
              top: displayW0.y - 20,
            }}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center border border-white shadow-md transition ${
              selectedHandle === 'w0'
                ? 'bg-indigo-500 text-white font-black'
                : 'bg-amber-500/90 text-white font-bold'
            }`}>
              <span className="text-[8px] font-mono">TL</span>
            </div>
          </div>

          <div
            onPointerDown={(e) => handlePointerDown(e, 'w1', wicketBoxPoints.w1)}
            className={`absolute w-10 h-10 rounded-full cursor-pointer flex items-center justify-center z-20 transition hover:scale-110 active:scale-95 touch-none ${
              selectedHandle === 'w1'
                ? 'ring-4 ring-indigo-500 ring-offset-2 ring-offset-slate-950 scale-110'
                : ''
            }`}
            style={{
              left: displayW1.x - 20,
              top: displayW1.y - 20,
            }}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center border border-white shadow-md transition ${
              selectedHandle === 'w1'
                ? 'bg-indigo-500 text-white font-black'
                : 'bg-amber-500/90 text-white font-bold'
            }`}>
              <span className="text-[8px] font-mono">BR</span>
            </div>
          </div>

          {/* Floating Magnifying Loupe UI */}
          {loupePos && (
            <div
              className="absolute pointer-events-none z-30"
              style={{
                left: Math.max(10, Math.min(workspaceDims.width - 130, loupePos.x - 60)),
                top: Math.max(10, loupePos.y - 140)
              }}
            >
              <canvas
                ref={loupeCanvasRef}
                width={120}
                height={120}
                className="w-[120px] h-[120px] rounded-full shadow-2xl bg-slate-900 border border-indigo-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Floating Selected Handle HUD & Nudge Controller */}
      {selectedHandle !== null && (
        <div className="mx-4 my-2 p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-2xl backdrop-blur-md z-30">
          <div className="flex flex-col gap-1 text-left select-none">
            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Adjusting Node</span>
            <span className="text-xs font-black text-slate-200">
              {typeof selectedHandle === 'number' 
                ? `Pitch Point #${selectedHandle} (${selectedHandle === 0 ? 'Far-Left' : selectedHandle === 1 ? 'Far-Right' : selectedHandle === 2 ? 'Near-Right' : 'Near-Left'})`
                : selectedHandle === 'w0' ? 'Wicket Box (Top-Left)' : 'Wicket Box (Bottom-Right)'}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              X: {Math.round(typeof selectedHandle === 'number' ? points[selectedHandle].x : selectedHandle === 'w0' ? wicketBoxPoints.w0.x : wicketBoxPoints.w1.x)}px, 
              Y: {Math.round(typeof selectedHandle === 'number' ? points[selectedHandle].y : selectedHandle === 'w0' ? wicketBoxPoints.w0.y : wicketBoxPoints.w1.y)}px
            </span>
            <button
              onClick={() => setSelectedHandle(null)}
              className="mt-1 text-[10px] font-bold text-rose-400 hover:text-rose-350 text-left transition"
            >
              ✕ Deselect Point
            </button>
          </div>

          {/* D-Pad controls */}
          <div className="grid grid-cols-3 gap-1 w-24 h-24 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
            <div />
            <button
              onClick={() => nudgeHandle('up', nudgeStep)}
              className="bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 text-white rounded-lg flex items-center justify-center transition text-xs font-bold"
              title="Nudge Up"
            >
              ▲
            </button>
            <div />
            <button
              onClick={() => nudgeHandle('left', nudgeStep)}
              className="bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 text-white rounded-lg flex items-center justify-center transition text-xs font-bold"
              title="Nudge Left"
            >
              ◀
            </button>
            <button
              onClick={() => setNudgeStep(prev => prev === 1 ? 5 : 1)}
              className={`rounded-lg flex flex-col items-center justify-center text-[9px] font-black font-mono transition border ${
                nudgeStep === 5 
                  ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300' 
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle step size"
            >
              {nudgeStep}px
            </button>
            <button
              onClick={() => nudgeHandle('right', nudgeStep)}
              className="bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 text-white rounded-lg flex items-center justify-center transition text-xs font-bold"
              title="Nudge Right"
            >
              ▶
            </button>
            <div />
            <button
              onClick={() => nudgeHandle('down', nudgeStep)}
              className="bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 text-white rounded-lg flex items-center justify-center transition text-xs font-bold"
              title="Nudge Down"
            >
              ▼
            </button>
            <div />
          </div>
        </div>
      )}

      {/* Warnings & Suggestions Panel */}
      {alignmentAnalysis.reasons.length > 0 && alignmentAnalysis.status !== 'excellent' && (
        <div className="px-6 py-2 bg-slate-900/60 border-t border-slate-800 text-xs text-amber-300">
          <ul className="list-disc pl-4 space-y-0.5">
            {alignmentAnalysis.reasons.map((r, i) => (
              <li key={`reason-${i}`}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Footer */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-between gap-4">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition duration-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!openCvLoaded || alignmentAnalysis.status === 'poor'}
          className={`flex-1 py-3 font-semibold rounded-xl text-white transition duration-200 ${
            openCvLoaded && alignmentAnalysis.status !== 'poor'
              ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 active:scale-98'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
          }`}
        >
          {!openCvLoaded ? 'Loading OpenCV...' : 'Save Calibration'}
        </button>
      </div>
    </div>
  );
}
