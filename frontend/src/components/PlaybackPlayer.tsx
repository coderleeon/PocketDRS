'use client';

import React, { useRef, useState, useEffect } from 'react';
import { CalibrationData, Point, LBWDecision } from '@/core/types';
import PitchOverlay from './PitchOverlay';

interface PlaybackPlayerProps {
  videoUrl: string;
  calibration: CalibrationData | null;
  projectMetersToPixels: (u: number, v: number) => Point | null;
  onClose: () => void;
  ballPositions?: { frame: number; x: number; y: number }[];
  rawPositions?: { frame: number; x: number; y: number }[];
  fps?: number;
  lbwDecision?: LBWDecision;
}

export default function PlaybackPlayer({
  videoUrl,
  calibration,
  projectMetersToPixels,
  onClose,
  ballPositions = [],
  rawPositions = [],
  fps = 30,
  lbwDecision
}: PlaybackPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [pitchOpacity, setPitchOpacity] = useState(40);
  const [wicketOpacity, setWicketOpacity] = useState(60);
  const [showDebug, setShowDebug] = useState(false);
  const [videoDims, setVideoDims] = useState({ width: 0, height: 0 });
  const [intrinsicDims, setIntrinsicDims] = useState({ width: 1280, height: 720 });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

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
              lbwDecision={lbwDecision}
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

        {/* PocketDRS Wicket Hitting Prediction HUD */}
        {lbwDecision && lbwDecision.decision !== 'UNKNOWN' && currentFrame >= (lbwDecision.impactFrame ?? 0) && (
          <div className="absolute top-4 right-4 z-20 pointer-events-auto p-4 rounded-2xl bg-slate-900/95 border border-slate-800 text-slate-100 flex flex-col gap-3 shadow-2xl backdrop-blur-md w-60">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="font-extrabold text-[10px] text-indigo-400 tracking-widest uppercase">PocketDRS Review</span>
              <span className="text-[10px] text-slate-400 font-mono">Conf: {lbwDecision.trajectoryConfidence}%</span>
            </div>

            {/* Decision Indicator Banner */}
            <div className={`py-3 px-4 rounded-xl text-center font-black text-xs tracking-wider shadow-lg border uppercase ${
              lbwDecision.decision === 'HITTING'
                ? 'bg-red-500/20 text-red-400 border-red-500/35 shadow-red-500/5'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/35 shadow-emerald-500/5'
            }`}>
              WICKET {lbwDecision.decision}
            </div>

            {/* Metrics List */}
            <div className="flex flex-col gap-2 text-[10px]">
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-lg border border-slate-950/20">
                <span className="text-slate-400 font-semibold">Bounce Dist</span>
                <span className="font-mono text-slate-200">
                  {lbwDecision.bouncePointMeters ? `${lbwDecision.bouncePointMeters.y.toFixed(2)}m` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-lg border border-slate-950/20">
                <span className="text-slate-400 font-semibold">Impact Dist</span>
                <span className="font-mono text-slate-200">
                  {lbwDecision.impactPointMeters ? `${lbwDecision.impactPointMeters.y.toFixed(2)}m` : 'N/A'}
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
          <span className="text-xs font-mono text-slate-400 w-10">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1.5 rounded-lg bg-slate-700 accent-indigo-500 cursor-pointer appearance-none"
          />
          <span className="text-xs font-mono text-slate-400 w-10">{formatTime(duration)}</span>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Play/Pause Button */}
          <div className="flex justify-center md:justify-start">
            <button
              onClick={togglePlay}
              className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition duration-200 active:scale-95 flex items-center justify-center gap-2 px-6"
            >
              {isPlaying ? (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Play
                </>
              )}
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
