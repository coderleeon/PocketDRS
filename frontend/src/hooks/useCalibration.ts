'use client';

import { useState, useEffect, useCallback } from 'react';
import { Point, WicketBox, CalibrationData } from '@/core/types';
import {
  calculateHomography,
  projectMetersToPixels,
  projectPixelsToMeters
} from '@/core/calibration/calibration';

export { PITCH_WIDTH, PITCH_LENGTH } from '@/core/calibration/calibration';

const STORAGE_KEY = 'pocketdrs_calibration';

export function useCalibration() {
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        Promise.resolve().then(() => {
          setCalibration(parsed);
        });
      } catch (e) {
        console.error('Failed to parse calibration from localStorage', e);
      }
    }
    Promise.resolve().then(() => {
      setIsLoaded(true);
    });
  }, []);

  /**
   * Computes the homography and inverse homography matrices using the core library
   */
  const saveCalibration = useCallback(
    async (pitchPoints: Point[], wicketBox: WicketBox): Promise<boolean> => {
      const result = calculateHomography(pitchPoints);
      
      if (!result.homography || !result.invHomography) {
        return false;
      }

      const newCal: CalibrationData = {
        pitchPoints,
        wicketBox,
        homography: result.homography,
        invHomography: result.invHomography,
        timestamp: Date.now(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCal));
      setCalibration(newCal);
      return true;
    },
    []
  );

  const clearCalibration = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCalibration(null);
  }, []);

  /**
   * Projects real-world coordinates (meters) to screen coordinates (pixels)
   * using the core projection functions.
   */
  const projectMetersToPixelsLocal = useCallback((u: number, v: number): Point | null => {
    return projectMetersToPixels(u, v, calibration?.invHomography ?? null);
  }, [calibration]);

  /**
   * Projects screen coordinates (pixels) to real-world coordinates (meters)
   * using the core projection functions.
   */
  const projectPixelsToMetersLocal = useCallback((x: number, y: number): Point | null => {
    return projectPixelsToMeters(x, y, calibration?.homography ?? null);
  }, [calibration]);

  return {
    calibration,
    isLoaded,
    saveCalibration,
    clearCalibration,
    projectMetersToPixels: projectMetersToPixelsLocal,
    projectPixelsToMeters: projectPixelsToMetersLocal,
  };
}
export type { CalibrationData };
