'use client';

import React, { useState, useRef } from 'react';
import { useOpenCV } from '../hooks/useOpenCV';
import { useCalibration } from '../hooks/useCalibration';
import { useBallTracker } from '../hooks/useBallTracker';
import CameraFeed from '../components/CameraFeed';
import CalibrationWorkspace from '../components/CalibrationWorkspace';
import PlaybackPlayer from '../components/PlaybackPlayer';
import ARAlignment from '../components/ARAlignment';
import { Point, WicketBox, LBWDecision } from '@/core/types';

interface Delivery {
  id: string;
  name: string;
  url: string;
  timestamp: number;
  sizeBytes: number;
  ballPositions?: { frame: number; x: number; y: number }[];
  rawPositions?: { frame: number; x: number; y: number }[];
  ballColor?: 'red' | 'white' | 'neon';
  lbwDecision?: LBWDecision;
}

export default function Home() {
  const { loaded: openCvLoaded } = useOpenCV();
  const {
    calibration,
    isLoaded: calibrationLoaded,
    saveCalibration,
    clearCalibration,
    projectMetersToPixels
  } = useCalibration();

  const {
    isProcessing,
    progress: trackingProgress,
    startTracking,
    stopTracking
  } = useBallTracker();

  // App workflow modes
  const [activeMode, setActiveMode] = useState<'dashboard' | 'calibrating_camera' | 'calibrating_canvas' | 'ar_alignment' | 'playing'>('dashboard');
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  
  // Recorded deliveries list
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);

  // Settings
  const [ballColor, setBallColor] = useState<'red' | 'white' | 'neon'>('red');
  const [devMode, setDevMode] = useState(false);

  // Diagnostic Canvas Refs for Developer Debug mode
  const debugMotionRef = useRef<HTMLCanvasElement>(null);
  const debugColorRef = useRef<HTMLCanvasElement>(null);
  const debugFinalRef = useRef<HTMLCanvasElement>(null);

  // Capture static image from live feed
  const handleCaptureFrame = (canvas: HTMLCanvasElement) => {
    setCapturedCanvas(canvas);
    setActiveMode('calibrating_canvas');
  };

  const handleSaveCalibration = async (points: Point[], wicketBox: WicketBox) => {
    const success = await saveCalibration(points, wicketBox);
    if (success) {
      setActiveMode('dashboard');
      setCapturedCanvas(null);
    } else {
      alert('Error calculating homography. Please check your calibration points and try again.');
    }
  };

  const handleRecordComplete = (blob: Blob, url: string) => {
    const newDelivery: Delivery = {
      id: `delivery_${Date.now()}`,
      name: `Delivery #${deliveries.length + 1}`,
      url,
      timestamp: Date.now(),
      sizeBytes: blob.size
    };
    setDeliveries(prev => [newDelivery, ...prev]);
  };

  const handleProcessDelivery = async (e: React.MouseEvent, del: Delivery) => {
    e.stopPropagation(); // Avoid triggering immediate playback opening
    if (!calibration) {
      alert('You must calibrate the pitch before processing ball tracking.');
      return;
    }

    try {
      // Fetch the recorded video Blob from local Object URL
      const response = await fetch(del.url);
      const blob = await response.blob();

      // Start client-side CV processing
      const trackingResult = await startTracking(
        blob,
        calibration,
        ballColor,
        devMode ? {
          motion: debugMotionRef,
          color: debugColorRef,
          final: debugFinalRef
        } : undefined
      );

      if (trackingResult) {
        setDeliveries(prev =>
          prev.map(d =>
            d.id === del.id
              ? {
                  ...d,
                  ballPositions: trackingResult.ballPositions,
                  rawPositions: trackingResult.rawPositions,
                  ballColor: ballColor,
                  lbwDecision: trackingResult.lbwDecision
                }
              : d
          )
        );
      }
    } catch (err) {
      console.error('Failed to process video: ', err);
      alert('Failed to process recorded delivery.');
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTimestamp = (ts: number): string => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Device Orientation Enforcer Overlay */}
      <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center select-none portrait:flex landscape:hidden">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-6 text-indigo-400 shadow-lg animate-pulse">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-black text-white tracking-wide">Landscape Mode Required</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm leading-relaxed">
          Pocket-DRS uses a fixed aspect ratio for precise pitch calibration and computer vision ball tracking.
        </p>
        <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mt-4">
          Please rotate your device to landscape
        </p>
      </div>

      {/* Dynamic Header */}
      <header className="p-5 bg-slate-900/60 border-b border-slate-800/80 backdrop-blur-lg flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="font-black text-sm text-white">PD</span>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Pocket-DRS
            </h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
              Pocket-DRS Engine
            </p>
          </div>
        </div>

        {/* Engine status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/60 rounded-full border border-slate-800 text-xs">
          <span className={`w-2.5 h-2.5 rounded-full ${openCvLoaded ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-amber-500 animate-pulse'}`} />
          <span className="text-slate-400">
            {openCvLoaded ? 'OpenCV.js Ready' : 'Loading CV Engine...'}
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Live Camera view / Workspaces */}
        <div className="md:col-span-2 flex flex-col gap-4">
          
          {/* Active Mode Controller */}
          <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-xl flex items-center justify-center">
            {activeMode === 'dashboard' && (
              <CameraFeed
                onRecordComplete={handleRecordComplete}
              />
            )}

            {activeMode === 'calibrating_camera' && (
              <CameraFeed
                isCalibrating={true}
                onCaptureFrame={handleCaptureFrame}
              />
            )}

            {activeMode === 'calibrating_canvas' && capturedCanvas && (
              <CalibrationWorkspace
                capturedCanvas={capturedCanvas}
                initialPoints={calibration?.pitchPoints}
                initialWicketBox={calibration?.wicketBox}
                onSave={handleSaveCalibration}
                onCancel={() => {
                  setActiveMode('dashboard');
                  setCapturedCanvas(null);
                }}
                openCvLoaded={openCvLoaded}
              />
            )}

            {activeMode === 'ar_alignment' && (
              <ARAlignment
                calibration={calibration}
                projectMetersToPixels={projectMetersToPixels}
                onClose={() => setActiveMode('dashboard')}
              />
            )}

            {activeMode === 'playing' && selectedDelivery && (
              <PlaybackPlayer
                videoUrl={selectedDelivery.url}
                calibration={calibration}
                projectMetersToPixels={projectMetersToPixels}
                ballPositions={selectedDelivery.ballPositions}
                rawPositions={selectedDelivery.rawPositions}
                lbwDecision={selectedDelivery.lbwDecision}
                onUpdateDecision={(newDecision) => {
                  setDeliveries(prev =>
                    prev.map(d =>
                      d.id === selectedDelivery.id
                        ? { ...d, lbwDecision: newDecision }
                        : d
                    )
                  );
                  setSelectedDelivery(prev => prev ? { ...prev, lbwDecision: newDecision } : null);
                }}
                onClose={() => {
                  setActiveMode('dashboard');
                  setSelectedDelivery(null);
                }}
              />
            )}
          </div>

          {/* Quick Dashboard Action Toggles */}
          {activeMode === 'dashboard' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <button
                onClick={() => setActiveMode('calibrating_camera')}
                disabled={!openCvLoaded}
                className={`py-3.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border transition ${
                  openCvLoaded
                    ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
                    : 'bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed'
                }`}
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Pitch Calibration
              </button>

              <button
                onClick={() => setActiveMode('ar_alignment')}
                disabled={!calibration}
                className={`py-3.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border transition ${
                  calibration
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500 shadow-md shadow-indigo-600/10'
                    : 'bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed'
                }`}
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                AR Alignment Mode
              </button>

              {calibration && (
                <button
                  onClick={clearCalibration}
                  className="py-3.5 px-4 rounded-xl font-semibold text-xs bg-slate-950 hover:bg-red-950/20 text-red-400 border border-slate-900 hover:border-red-900/40 transition col-span-2 sm:col-span-1"
                >
                  Reset Calibration
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Calibration Profile Status, Settings & Recording Lists */}
        <div className="flex flex-col gap-6">
          
          {/* Card 1: Calibration Status summary */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex flex-col gap-4">
            <h2 className="text-sm font-bold tracking-wide uppercase text-slate-400">
              Calibration Profile
            </h2>
            
            {calibrationLoaded && calibration ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm font-bold text-slate-200">Active Profile Loaded</span>
                </div>
                
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/60 grid grid-cols-2 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block">Corners</span>
                    <span className="text-slate-300">4 Points Configured</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Wicket Target</span>
                    <span className="text-slate-300">
                      {Math.round(calibration.wicketBox.w)} x {Math.round(calibration.wicketBox.h)} px
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block">Last Calibration</span>
                    <span className="text-slate-300">
                      {new Date(calibration.timestamp).toLocaleDateString()} {new Date(calibration.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-sm font-bold text-slate-200">No Profile Configured</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  You must calibrate the pitch boundaries and the cardboard wicket marker to display overlays correctly.
                </p>
                <button
                  onClick={() => setActiveMode('calibrating_camera')}
                  disabled={!openCvLoaded}
                  className={`mt-1 py-3 px-4 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-2 ${
                    openCvLoaded ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-98' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  }`}
                >
                  Start Calibration
                </button>
              </div>
            )}
          </div>

          {/* Card 2: CV Tracking Settings */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex flex-col gap-4">
            <h2 className="text-sm font-bold tracking-wide uppercase text-slate-400">
              Ball Tracking Engine
            </h2>
            
            <div className="flex flex-col gap-3.5">
              {/* Ball Color Preset */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400 font-semibold">Ball Color Preset</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setBallColor('red')}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition ${
                      ballColor === 'red'
                        ? 'bg-red-500/25 border-red-500 text-red-200 font-black'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Red Ball
                  </button>
                  <button
                    onClick={() => setBallColor('white')}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition ${
                      ballColor === 'white'
                        ? 'bg-slate-400/20 border-slate-400 text-slate-200 font-black'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    White Ball
                  </button>
                  <button
                    onClick={() => setBallColor('neon')}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition ${
                      ballColor === 'neon'
                        ? 'bg-lime-500/25 border-lime-500 text-lime-200 font-black'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Neon Ball
                  </button>
                </div>
              </div>

              {/* Developer mode toggle */}
              <div className="flex justify-between items-center border-t border-slate-800/80 pt-3.5">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-350">Developer Debug Mode</span>
                  <span className="text-[10px] text-slate-500">Show diagnostic visual masks</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={devMode}
                    onChange={(e) => setDevMode(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white" />
                </label>
              </div>
            </div>
          </div>

          {/* Card 3: Recorded deliveries list */}
          <div className="flex-1 p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold tracking-wide uppercase text-slate-400">
                Session Recordings
              </h2>
              <span className="px-2.5 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-300 rounded-full">
                {deliveries.length}
              </span>
            </div>

            {deliveries.length > 0 ? (
              <div className="flex-1 overflow-y-auto max-h-[300px] flex flex-col gap-2.5 pr-1">
                {deliveries.map(del => (
                  <div
                    key={del.id}
                    onClick={() => {
                      setSelectedDelivery(del);
                      setActiveMode('playing');
                    }}
                    className="p-3.5 rounded-xl bg-slate-950/80 hover:bg-indigo-950/20 border border-slate-800/80 hover:border-indigo-950/80 transition cursor-pointer flex justify-between items-center group"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 transition">
                        {del.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {formatTimestamp(del.timestamp)} • {formatSize(del.sizeBytes)}
                        {del.ballPositions && (
                          <span className="text-emerald-400 font-bold ml-1.5">• Tracked</span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pointer-events-auto">
                      {/* Process/Track video action button */}
                      {!del.ballPositions && (
                        <button
                          onClick={(e) => handleProcessDelivery(e, del)}
                          disabled={!calibration || !openCvLoaded}
                          className={`p-2 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition ${
                            calibration && openCvLoaded
                              ? 'bg-slate-900 hover:bg-indigo-950/40 text-indigo-400 border-indigo-900/40 hover:border-indigo-500/30'
                              : 'bg-slate-950/40 text-slate-600 border-slate-900 cursor-not-allowed'
                          }`}
                          title={!calibration ? "Calibrate pitch to track" : "Process tracking"}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Track
                        </button>
                      )}

                      <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center group-hover:bg-indigo-600 transition shadow-inner">
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-white transition" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 101.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800/80 rounded-xl">
                <svg className="w-8 h-8 text-slate-600 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-semibold text-slate-400">No deliveries recorded</span>
                <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] leading-relaxed">
                  Start the camera feed and tap the Red button to record your first delivery.
                </p>
              </div>
            )}
          </div>

          {/* Card 4: About & Connect */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-850 pb-2">
              <h2 className="text-xs font-black tracking-wider uppercase text-indigo-400">
                About Pocket-DRS
              </h2>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Pocket-DRS is an experimental computer-vision-powered cricket review system designed for home, society, and amateur cricket. The platform uses on-device computer vision and trajectory analysis to estimate ball tracking, wicket prediction, and LBW decisions directly in the browser.
            </p>

            <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Creator</span>
              <div className="flex flex-col text-[11px]">
                <span className="font-extrabold text-slate-200">Leeon John</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Connect</span>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                <a
                  href="mailto:leeonjohn.work@gmail.com"
                  className="py-2 px-1 rounded-xl bg-slate-950 hover:bg-indigo-950/35 border border-slate-850 hover:border-indigo-900/50 text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1.5 transition text-center shadow-sm"
                >
                  Email
                </a>
                <a
                  href="https://www.linkedin.com/in/leeon-john-14172a159/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-1 rounded-xl bg-slate-950 hover:bg-indigo-950/35 border border-slate-850 hover:border-indigo-900/50 text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1.5 transition text-center shadow-sm"
                >
                  LinkedIn
                </a>
                <a
                  href="https://github.com/coderleeon"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-1 rounded-xl bg-slate-950 hover:bg-indigo-950/35 border border-slate-850 hover:border-indigo-900/50 text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1.5 transition text-center shadow-sm"
                >
                  GitHub
                </a>
                <a
                  href="https://x.com/LeeonJohn_"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-1 rounded-xl bg-slate-950 hover:bg-indigo-950/35 border border-slate-850 hover:border-indigo-900/50 text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1.5 transition text-center shadow-sm"
                >
                  X (Twitter)
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-1 border-t border-slate-800/60 pt-2 text-[9px] text-slate-500 leading-relaxed">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[8px]">Disclaimer</span>
              <p>
                Pocket-DRS is an independent experimental project intended for amateur cricket analysis. It is not affiliated with ICC, Hawk-Eye, or any professional cricket governing body.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* CV PROCESSING LOADING POPUP OVERLAY */}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col justify-center items-center z-50 p-6">
          <div className="w-full max-w-xl p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-6 shadow-2xl items-center text-center">
            
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-bold text-white tracking-wide">Processing Delivery Analysis</h3>
              <p className="text-xs text-slate-400">Running client-side OpenCV.js frame differencing and chroma masking.</p>
            </div>

            {/* Spinner and progress bar */}
            <div className="w-full flex flex-col gap-2 items-center">
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-200"
                  style={{ width: `${trackingProgress}%` }}
                />
              </div>
              <span className="text-sm font-mono font-bold text-indigo-400">{trackingProgress}% Completed</span>
            </div>

            {/* Live Developer Debug diagnostic stream canvases */}
            {devMode && (
              <div className="w-full flex flex-col gap-2.5 border-t border-slate-800/80 pt-4 text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">CV Diagnostic Masks Stream</span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <canvas ref={debugMotionRef} className="w-full aspect-video rounded border border-slate-800 bg-black object-contain" />
                    <span className="text-[9px] font-mono text-slate-500 text-center">Motion Mask</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <canvas ref={debugColorRef} className="w-full aspect-video rounded border border-slate-800 bg-black object-contain" />
                    <span className="text-[9px] font-mono text-slate-500 text-center">Color Mask</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <canvas ref={debugFinalRef} className="w-full aspect-video rounded border border-slate-800 bg-black object-contain" />
                    <span className="text-[9px] font-mono text-slate-500 text-center">Final Detection</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action controls */}
            <button
              onClick={stopTracking}
              className="mt-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition"
            >
              Cancel Processing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
