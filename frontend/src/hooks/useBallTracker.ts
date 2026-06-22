'use client';

import { useState, useCallback, useRef } from 'react';
import { CalibrationData, LBWDecision } from '@/core/types';
import { trackBallInVideo, TrackingResult, DebugCanvasElements } from '@/core/tracking/tracker';
import { checkLBWDecision } from '@/core/lbw/lbw';

interface DebugCanvasRefs {
  motion?: React.RefObject<HTMLCanvasElement | null>;
  color?: React.RefObject<HTMLCanvasElement | null>;
  final?: React.RefObject<HTMLCanvasElement | null>;
}

export function useBallTracker() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [error, setError] = useState<string | null>(null);

  // Reference to cancel tracking if needed
  const cancelRef = useRef<boolean>(false);

  const startTracking = useCallback(
    async (
      videoBlob: Blob,
      calibration: CalibrationData | null,
      ballColor: 'red' | 'white' | 'neon',
      debugRefs?: DebugCanvasRefs
    ): Promise<(TrackingResult & { lbwDecision?: LBWDecision }) | null> => {
      setIsProcessing(true);
      setProgress(0);
      setError(null);
      cancelRef.current = false;

      try {
        const debugCanvases: DebugCanvasElements = {
          motion: debugRefs?.motion?.current,
          color: debugRefs?.color?.current,
          final: debugRefs?.final?.current
        };

        const trackingResult = await trackBallInVideo(videoBlob, calibration, ballColor, {
          onProgress: setProgress,
          onCancelCheck: () => cancelRef.current,
          debugCanvases
        });

        if (trackingResult) {
          const lbwDecision = checkLBWDecision(calibration, trackingResult.ballPositions);
          setIsProcessing(false);
          return {
            ...trackingResult,
            lbwDecision
          };
        }

        setIsProcessing(false);
        return null;
      } catch (err: unknown) {
        console.error('Failed to process video: ', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        setIsProcessing(false);
        return null;
      }
    },
    []
  );

  const stopTracking = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return {
    isProcessing,
    progress,
    error,
    startTracking,
    stopTracking
  };
}
export type { TrackingResult };
