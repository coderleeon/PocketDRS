'use client';

import React, { useRef, useState, useEffect } from 'react';
import { CalibrationData, Point, LBWDecision } from '@/core/types';
import PitchOverlay from './PitchOverlay';
import { checkLBWDecision } from '@/core/lbw/lbw';

interface PlaybackPlayerProps {
  videoUrl: string;
  calibration: CalibrationData | null;
  projectMetersToPixels: (u: number, v: number) => Point | null;
  onClose: () => void;
  ballPositions?: { frame: number; x: number; y: number }[];
  rawPositions?: { frame: number; x: number; y: number }[];
  fps?: number;
  lbwDecision?: LBWDecision;
  onUpdateDecision?: (decision: LBWDecision) => void;
}

export default function PlaybackPlayer({
  videoUrl,
  calibration,
  projectMetersToPixels,
  onClose,
  ballPositions = [],
  rawPositions = [],
  fps = 30,
  lbwDecision,
  onUpdateDecision
}: PlaybackPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [wasPlayingBeforeScrubbing, setWasPlayingBeforeScrubbing] = useState(false);
  const [pitchOpacity, setPitchOpacity] = useState(40);
  const [wicketOpacity, setWicketOpacity] = useState(60);
  const [showDebug, setShowDebug] = useState(false);
  const [videoDims, setVideoDims] = useState({ width: 0, height: 0 });
  const [intrinsicDims, setIntrinsicDims] = useState({ width: 1280, height: 720 });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [batsmanHandedness, setBatsmanHandedness] = useState<'RHB' | 'LHB'>(lbwDecision?.batsmanHandedness ?? 'RHB');
  const [strokeOffered, setStrokeOffered] = useState(lbwDecision?.strokeOffered ?? true);

  // Dynamically re-evaluate checkLBWDecision locally when handedness or strokeOffered toggles are changed in real-time
  const activeLbwDecision = React.useMemo(() => {
    if (!ballPositions || ballPositions.length === 0) return lbwDecision;
    return checkLBWDecision(calibration, ballPositions, batsmanHandedness, strokeOffered);
  }, [calibration, ballPositions, batsmanHandedness, strokeOffered, lbwDecision]);

  // Propagate the updated decision back to the parent state in page.tsx
  useEffect(() => {
    if (onUpdateDecision && activeLbwDecision && (
      activeLbwDecision.decision !== lbwDecision?.decision ||
      activeLbwDecision.batsmanHandedness !== lbwDecision?.batsmanHandedness ||
      activeLbwDecision.strokeOffered !== lbwDecision?.strokeOffered
    )) {
      onUpdateDecision(activeLbwDecision);
    }
  }, [activeLbwDecision, onUpdateDecision, lbwDecision]);

  // Calculate current frame index based on playback time
  const currentFrame = Math.floor(currentTime * fps);

  // Resize handler to match canvas coordinates to actual displayed video sizing
  const updateDimensions = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      setVideoDims({
        width: video.clientWidth,
        height: video.clientHeight
      });
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateDimensions);
    const timer = setTimeout(updateDimensions, 300);
    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(timer);
    };
  }, [videoUrl]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      setIntrinsicDims({
        width: video.videoWidth,
        height: video.videoHeight
      });
      setDuration(video.duration);
      updateDimensions();
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !isScrubbing) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = React.useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(err => console.error("Error playing video: ", err));
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, []);

  const handleScrubStart = () => {
    setIsScrubbing(true);
    if (videoRef.current) {
      setWasPlayingBeforeScrubbing(!videoRef.current.paused);
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
    if (videoRef.current && wasPlayingBeforeScrubbing) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => console.error("Error playing video: ", err));
    }
  };

  const skipSeconds = React.useCallback((amount: number) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + amount));
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [duration]);

  const stepFrames = React.useCallback((frames: number) => {
    if (videoRef.current) {
      const step = frames / fps;
      const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + step));
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [duration, fps]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'text') {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            skipSeconds(-5);
          } else {
            stepFrames(-1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            skipSeconds(5);
          } else {
            stepFrames(1);
          }
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          skipSeconds(-5);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          skipSeconds(5);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [togglePlay, skipSeconds, stepFrames]);

  const formatTime = (secs: number) => {
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    const ms = Math.floor((secs % 1) * 100).toString().padStart(2, '0');
    return `${s}.${ms}`;
  };

  const activeCentroid = ballPositions.find(p => p.frame === currentFrame);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden">
      {/* Top Header */}
      <div className="p-4 flex justify-between items-center bg-slate-900/80 border-b border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-white tracking-wide">Delivery Playback</h2>
          {ballPositions.length > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">
              Tracked Path Included
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition duration-200"
        >
          Close
        </button>
      </div>

      {/* Main Video & Canvas Container */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full flex items-center justify-center bg-black overflow-hidden"
      >
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          loop
          className="max-w-full max-h-full object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onClick={togglePlay}
        />

        {/* Pitch Overlay Canvas */}
        {videoDims.width > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              width: videoDims.width,
              height: videoDims.height,
            }}
          >
            <PitchOverlay
              calibration={calibration}
              pitchOpacity={pitchOpacity}
              wicketOpacity={wicketOpacity}
              width={videoDims.width}
              height={videoDims.height}
              intrinsicWidth={intrinsicDims.width}
              intrinsicHeight={intrinsicDims.height}
              projectMetersToPixels={projectMetersToPixels}
              ballPositions={ballPositions}
              rawPositions={rawPositions}
              currentFrame={currentFrame}
              debugMode={showDebug}
              lbwDecision={activeLbwDecision}
            />
          </div>
        )}

        {/* Floating Debug Centroid HUD Panel */}
        {ballPositions.length > 0 && (
          <div className="absolute top-4 left-4 z-20 pointer-events-auto p-3.5 rounded-xl bg-slate-900/95 border border-slate-800 text-xs text-slate-300 flex flex-col gap-2.5 shadow-2xl backdrop-blur-md max-w-[200px]">
            <div className="flex justify-between items-center gap-6 border-b border-slate-800/80 pb-1.5">
              <span className="font-bold text-slate-200 uppercase tracking-wider text-[10px]">Diagnostics HUD</span>
              <span className="text-[10px] font-mono bg-slate-800 px-1 py-0.5 rounded text-indigo-400">Frame {currentFrame}</span>
            </div>
            
            <div className="flex flex-col gap-1 font-mono text-[10px]">
              <div>
                <span className="text-slate-500">Centroid: </span>
                {activeCentroid ? (
                  <span className="text-emerald-400">{Math.round(activeCentroid.x)}, {Math.round(activeCentroid.y)}</span>
                ) : (
                  <span className="text-slate-500">No detection</span>
                )}
              </div>
              <div>
                <span className="text-slate-500">Coordinates: </span>
                {activeCentroid ? (
                  <span className="text-indigo-400">{(activeCentroid.x / intrinsicDims.width).toFixed(2)}, {(activeCentroid.y / intrinsicDims.height).toFixed(2)}</span>
                ) : (
                  <span className="text-slate-500">N/A</span>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDebug}
                onChange={(e) => setShowDebug(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-500 rounded bg-slate-800 border-slate-700 cursor-pointer"
              />
              <span className="text-[10px] font-semibold text-slate-300">Show Centroids</span>
            </label>
          </div>
        )}

        {/* Pocket-DRS Wicket Hitting Prediction HUD */}
        {activeLbwDecision && activeLbwDecision.decision !== 'UNKNOWN' && currentFrame >= (activeLbwDecision.impactFrame ?? 0) && (
          <div className="absolute top-4 right-4 z-20 pointer-events-auto p-4 rounded-2xl bg-slate-900/95 border border-slate-800 text-slate-100 flex flex-col gap-3 shadow-2xl backdrop-blur-md w-64">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="font-extrabold text-[10px] text-indigo-400 tracking-widest uppercase">Pocket-DRS Review</span>
              <span className="text-[10px] text-slate-400 font-mono">Conf: {activeLbwDecision.trajectoryConfidence}%</span>
            </div>

            {/* Decision Indicator Banner */}
            <div className={`py-3 px-4 rounded-xl text-center font-black text-sm tracking-wider shadow-lg border uppercase transition duration-200 ${
              activeLbwDecision.decision === 'OUT'
                ? 'bg-red-500/25 text-red-400 border-red-500/50 shadow-red-500/10'
                : 'bg-emerald-500/25 text-emerald-400 border-emerald-500/50 shadow-emerald-500/10'
            }`}>
              {activeLbwDecision.decision === 'OUT' ? 'OUT' : 'NOT OUT'}
            </div>

            {/* Reason Label */}
            {activeLbwDecision.decision === 'NOT_OUT' && (
              <span className="text-[9px] text-center font-bold text-rose-450 uppercase tracking-wide">
                {activeLbwDecision.lbwReason}
              </span>
            )}

            {/* Handedness & Stroke Offered Toggles */}
            <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/60">
              {/* Handedness Toggle */}
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-semibold">Batter Side</span>
                <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                  <button
                    onClick={() => setBatsmanHandedness('RHB')}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
                      batsmanHandedness === 'RHB' 
                        ? 'bg-indigo-600 text-white font-extrabold shadow' 
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    RHB
                  </button>
                  <button
                    onClick={() => setBatsmanHandedness('LHB')}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
                      batsmanHandedness === 'LHB' 
                        ? 'bg-indigo-600 text-white font-extrabold shadow' 
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    LHB
                  </button>
                </div>
              </div>

              {/* Stroke Offered Toggle */}
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-semibold">Shot Played</span>
                <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                  <button
                    onClick={() => setStrokeOffered(true)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
                      strokeOffered 
                        ? 'bg-indigo-600 text-white font-extrabold shadow' 
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setStrokeOffered(false)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
                      !strokeOffered 
                        ? 'bg-indigo-600 text-white font-extrabold shadow' 
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>

            {/* Check stages breakdown */}
            <div className="flex flex-col gap-1.5 text-[9px] border-t border-slate-800/60 pt-2 text-slate-300">
              {/* Pitching check */}
              <div className="flex justify-between items-center">
                <span>1. Pitching</span>
                <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase ${
                  activeLbwDecision.pitchZone === 'OUTSIDE_LEG' 
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20' 
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {activeLbwDecision.pitchZone === 'IN_LINE' ? 'In Line' : activeLbwDecision.pitchZone === 'OUTSIDE_OFF' ? 'Outside Off' : 'Outside Leg'}
                </span>
              </div>

              {/* Impact check */}
              <div className="flex justify-between items-center">
                <span>2. Impact</span>
                <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase ${
                  activeLbwDecision.impactZone === 'OUTSIDE_LEG' || (strokeOffered && activeLbwDecision.impactZone === 'OUTSIDE_OFF')
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20' 
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {activeLbwDecision.impactZone === 'IN_LINE' ? 'In Line' : activeLbwDecision.impactZone === 'OUTSIDE_OFF' ? 'Outside Off' : 'Outside Leg'}
                </span>
              </div>

              {/* Wickets check */}
              <div className="flex justify-between items-center">
                <span>3. Wickets</span>
                <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase ${
                  activeLbwDecision.stumpsHit 
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-red-500/15 text-red-400 border border-red-500/20'
                }`}>
                  {activeLbwDecision.stumpsHit ? 'Hitting' : 'Missing'}
                </span>
              </div>
            </div>

            {/* Metrics List */}
            <div className="flex flex-col gap-1.5 text-[9px] border-t border-slate-800/60 pt-2">
              <div className="flex justify-between items-center text-slate-400">
                <span>Bounce Distance</span>
                <span className="font-mono text-slate-200">
                  {activeLbwDecision.bouncePointMeters ? `${activeLbwDecision.bouncePointMeters.y.toFixed(2)}m` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Impact Distance</span>
                <span className="font-mono text-slate-200">
                  {activeLbwDecision.impactPointMeters ? `${activeLbwDecision.impactPointMeters.y.toFixed(2)}m` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Custom Control Dock */}
      <div className="p-6 bg-slate-900/90 border-t border-slate-800 backdrop-blur-md flex flex-col gap-5">
        {/* Seekbar and Timeline */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-slate-400 w-20 text-right">{formatTime(currentTime)} (F{currentFrame})</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={1 / fps}
            value={currentTime}
            onChange={handleSeek}
            onPointerDown={handleScrubStart}
            onMouseDown={handleScrubStart}
            onPointerUp={handleScrubEnd}
            onMouseUp={handleScrubEnd}
            onTouchStart={handleScrubStart}
            onTouchEnd={handleScrubEnd}
            className="flex-1 h-1.5 rounded-lg bg-slate-700 accent-indigo-500 cursor-pointer appearance-none"
          />
          <span className="text-xs font-mono text-slate-400 w-20 text-left">{formatTime(duration)} (F{Math.floor(duration * fps)})</span>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Playback Button Dock */}
          <div className="flex justify-center md:justify-start items-center gap-2">
            {/* Skip Backward 5s */}
            <button
              onClick={() => skipSeconds(-5)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition duration-200 active:scale-95 flex items-center justify-center border border-slate-700/50 shadow"
              title="Skip backward 5s"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
              </svg>
              <span className="text-[9px] font-bold ml-0.5">-5s</span>
            </button>

            {/* Step Backward 1 Frame */}
            <button
              onClick={() => stepFrames(-1)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition duration-200 active:scale-95 flex items-center justify-center border border-slate-700/50 shadow"
              title="Previous frame (-1 frame)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-[9px] font-bold ml-0.5">-1F</span>
            </button>

            {/* Play / Pause */}
            <button
              onClick={togglePlay}
              className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-650/20 transition duration-200 active:scale-95 flex items-center justify-center gap-1.5 px-4 font-black text-xs min-w-[85px]"
            >
              {isPlaying ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 101.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Play
                </>
              )}
            </button>

            {/* Step Forward 1 Frame */}
            <button
              onClick={() => stepFrames(1)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition duration-200 active:scale-95 flex items-center justify-center border border-slate-700/50 shadow"
              title="Next frame (+1 frame)"
            >
              <span className="text-[9px] font-bold mr-0.5">+1F</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Skip Forward 5s */}
            <button
              onClick={() => skipSeconds(5)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition duration-200 active:scale-95 flex items-center justify-center border border-slate-700/50 shadow"
              title="Skip forward 5s"
            >
              <span className="text-[9px] font-bold mr-0.5">+5s</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z" />
              </svg>
            </button>
          </div>

          {/* Opacity Control sliders */}
          <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>Pitch Overlay Opacity</span>
                <span>{pitchOpacity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={pitchOpacity}
                onChange={(e) => setPitchOpacity(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-700 accent-emerald-500 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>Wicket Overlay Opacity</span>
                <span>{wicketOpacity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={wicketOpacity}
                onChange={(e) => setWicketOpacity(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-700 accent-amber-500 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
