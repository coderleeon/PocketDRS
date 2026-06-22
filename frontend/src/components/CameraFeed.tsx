'use client';

import React, { useRef, useState, useEffect } from 'react';

interface CameraFeedProps {
  onRecordComplete?: (blob: Blob, url: string) => void;
  isCalibrating?: boolean;
  onCaptureFrame?: (canvas: HTMLCanvasElement) => void;
}

export default function CameraFeed({
  onRecordComplete,
  isCalibrating = false,
  onCaptureFrame
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streamLoaded, setStreamLoaded] = useState(false);

  // Initialize camera stream
  useEffect(() => {
    async function startCamera() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: 'environment', // Use rear camera
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, min: 30 } // Attempt 60 FPS for tracking quality
          },
          audio: false // No audio needed for pitch calibration / tracking
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamLoaded(true);
        }
      } catch (err: unknown) {
        console.error('Error accessing camera: ', err);
        setError(
          'Could not access the rear camera. Please ensure permissions are granted and you are using HTTPS.'
        );
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Timer logic for recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      Promise.resolve().then(() => {
        setRecordingSeconds(0);
      });
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const getSupportedMimeType = (): string => {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/quicktime'
    ];
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    setIsRecording(true);
    setError(null);

    const chunks: Blob[] = [];
    const mimeType = getSupportedMimeType();

    try {
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(chunks, { type: mimeType || 'video/mp4' });
        const videoUrl = URL.createObjectURL(videoBlob);
        if (onRecordComplete) {
          onRecordComplete(videoBlob, videoUrl);
        }
      };

      mediaRecorder.start();
    } catch (err: unknown) {
      console.error('MediaRecorder start failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`Recording failed: ${errMsg}`);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const captureFrame = () => {
    if (videoRef.current && onCaptureFrame) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        onCaptureFrame(canvas);
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
      {error && (
        <div className="absolute top-4 left-4 right-4 z-50 p-4 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-sm backdrop-blur-md">
          {error}
        </div>
      )}

      {/* Camera Video Stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Recording HUD Overlay */}
      {streamLoaded && !isCalibrating && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
          {/* Top HUD bar */}
          <div className="flex items-center justify-between w-full">
            <span className="px-3 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full backdrop-blur-md">
              60 FPS Target
            </span>
            {isRecording && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-600/20 border border-red-500/30 text-red-300 rounded-full backdrop-blur-md animate-pulse">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 block"></span>
                <span className="text-xs font-mono font-bold">{formatTime(recordingSeconds)}</span>
              </div>
            )}
          </div>

          {/* Bottom Control panel */}
          <div className="flex items-center justify-center w-full pointer-events-auto mt-auto">
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                title="Stop Recording"
              >
                <div className="w-6 h-6 bg-red-600 rounded" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="w-16 h-16 rounded-full bg-red-600 border-4 border-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                title="Start Recording"
              >
                <div className="w-8 h-8 bg-red-600 rounded-full border border-red-700 shadow-inner" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Calibration Capture Overlay */}
      {streamLoaded && isCalibrating && onCaptureFrame && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20">
          <button
            onClick={captureFrame}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-semibold shadow-lg backdrop-blur-md border border-indigo-400/40 flex items-center gap-2 transition duration-200 active:scale-95"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Capture Frame
          </button>
        </div>
      )}
    </div>
  );
}
