'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CalibrationData, Point } from '@/core/types';
import PitchOverlay from './PitchOverlay';
import { calculateAlignmentConfidence } from '@/core/geometry/geom';

interface ARAlignmentProps {
  calibration: CalibrationData | null;
  projectMetersToPixels: (u: number, v: number) => Point | null;
  onClose: () => void;
  videoWidth?: number;
  videoHeight?: number;
}

export default function ARAlignment({
  calibration,
  projectMetersToPixels,
  onClose,
  videoWidth = 1280,
  videoHeight = 720
}: ARAlignmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [videoDims, setVideoDims] = useState({ width: 0, height: 0 });
  const [deviceTilt, setDeviceTilt] = useState({ pitch: 0, roll: 0 });
  const [isLevel, setIsLevel] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);

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
    async function startCamera() {
      try {
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('AR Alignment Camera error: ', err);
      }
    }

    startCamera();
    window.addEventListener('resize', updateDimensions);
    const timer = setTimeout(updateDimensions, 400);

    const currentVideo = videoRef.current;
    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(timer);
      if (currentVideo && currentVideo.srcObject) {
        const stream = currentVideo.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Monitor device orientation for level calibration check
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const pitch = e.beta ? Math.round(e.beta) : 0; // Front-to-back tilt (-180 to 180)
      const roll = e.gamma ? Math.round(e.gamma) : 0;  // Left-to-right tilt (-90 to 90)

      setDeviceTilt({ pitch, roll });

      // Determine if device is reasonably vertical and level
      // For pitch recording, the phone is usually mounted vertically (e.g. tilt of 70-90 deg) or in landscape.
      // Let's check roll stability: roll should be close to 0 (phone is horizontal/not skewed left/right).
      // We warn if roll is greater than 3 degrees.
      setIsLevel(Math.abs(roll) <= 3);
    };

    // Request permissions for iOS 13+ device orientation if needed
    const requestOrientationPermission = async () => {
      const DeviceOrientationRequest = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<PermissionState> }).requestPermission;
      if (typeof DeviceOrientationRequest === 'function') {
        try {
          const res = await DeviceOrientationRequest();
          if (res === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
            setPermissionGranted(true);
          }
        } catch (e) {
          console.warn('Orientation permission request failed', e);
        }
      } else {
        // Android / standard desktop
        window.addEventListener('deviceorientation', handleOrientation);
        setPermissionGranted(true);
      }
    };

    requestOrientationPermission();

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const handleLoadedMetadata = () => {
    updateDimensions();
  };

  // Evaluate calibration points
  const alignmentAnalysis = calibration 
    ? calculateAlignmentConfidence(calibration.pitchPoints, videoWidth, videoHeight)
    : { confidence: 0, status: 'poor', reasons: ['No calibration profile loaded. Please calibrate first.'] };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden">
      {/* Top Header Panel */}
      <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex justify-between items-center text-white backdrop-blur-md z-20">
        <div>
          <h2 className="text-base font-bold tracking-wide">AR Alignment Mode</h2>
          <p className="text-xs text-slate-400">Position the phone to align overlays with the pitch.</p>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition duration-200"
        >
          Exit
        </button>
      </div>

      {/* Main Video Stream Overlay Container */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          onLoadedMetadata={handleLoadedMetadata}
        />

        {/* Pitch / Wicket Overlay Canvas */}
        {videoDims.width > 0 && calibration && (
          <div
            className="absolute pointer-events-none"
            style={{
              width: videoDims.width,
              height: videoDims.height
            }}
          >
            <PitchOverlay
              calibration={calibration}
              pitchOpacity={50}
              wicketOpacity={70}
              width={videoDims.width}
              height={videoDims.height}
              intrinsicWidth={videoWidth}
              intrinsicHeight={videoHeight}
              projectMetersToPixels={projectMetersToPixels}
            />
          </div>
        )}

        {/* Digital Level / Bubble Overlay (Floating Center Level) */}
        {permissionGranted && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Center target circle */}
            <div className="relative w-28 h-28 border-2 border-white/20 rounded-full flex items-center justify-center">
              {/* Central crosshair */}
              <div className="absolute w-4 h-0.5 bg-white/30" />
              <div className="absolute h-4 w-0.5 bg-white/30" />

              {/* Dynamic Bubble Level */}
              <div
                className={`absolute w-8 h-8 rounded-full border-2 shadow-lg transition-colors flex items-center justify-center ${
                  isLevel ? 'bg-emerald-500/80 border-emerald-300' : 'bg-red-500/80 border-red-300'
                }`}
                style={{
                  transform: `translate(${Math.max(-40, Math.min(40, deviceTilt.roll * 2))}px, ${Math.max(-40, Math.min(40, (deviceTilt.pitch - 90) * 1.5))}px)`,
                  transition: 'transform 0.1s ease-out'
                }}
              >
                <span className="text-[9px] font-bold text-white font-mono">{deviceTilt.roll}°</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Alignment HUD controls & feedback */}
      <div className="p-5 bg-slate-900/90 border-t border-slate-800 backdrop-blur-md z-20 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Alignment Confidence Card */}
          <div className="flex-1 w-full p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Calibration Score</span>
              <span className={`text-base font-bold ${
                alignmentAnalysis.status === 'excellent' ? 'text-emerald-400' :
                alignmentAnalysis.status === 'good' ? 'text-teal-400' :
                alignmentAnalysis.status === 'fair' ? 'text-amber-400' : 'text-red-400'
              }`}>
                {alignmentAnalysis.confidence}% - {alignmentAnalysis.status.toUpperCase()}
              </span>
            </div>
            
            <div className="text-right flex flex-col items-end">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider font-mono">Rotation/Roll</span>
              <span className={`text-sm font-bold font-mono ${isLevel ? 'text-emerald-400' : 'text-red-400'}`}>
                {deviceTilt.roll}° {isLevel ? 'LEVEL' : 'TILTED'}
              </span>
            </div>
          </div>
        </div>

        {/* Alignment instructions and corrections */}
        <div className="text-xs text-slate-300">
          {!isLevel ? (
            <p className="flex items-center gap-2 text-red-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 block animate-pulse"></span>
              Warning: Phone is tilted sideways. Rotate phone slightly to align bubble level.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 block"></span>
              Device level looks good. Position smartphone so the green overlays map perfectly onto the pitch boundaries.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
