/* eslint-disable @typescript-eslint/no-unused-vars */
import { CalibrationData, BowlingAnalytics, TrajectoryPoint } from '@/core/types';

/**
 * Calculates bowling speed in km/h using frame delivery times and real-world distance metrics.
 */
export function calculateBowlingSpeed(
  calibration: CalibrationData | null,
  ballPositions: TrajectoryPoint[],
  fps: number
): number {
  if (!calibration || ballPositions.length < 2) return 0;
  
  // Version 2 will calculate velocity in m/s using projected meters coordinates, then convert to km/h
  return 0;
}

/**
 * Classifies the line and length of the delivery based on its bounce point location on the pitch.
 */
export function classifyLineAndLength(
  calibration: CalibrationData | null,
  bouncePointMeters: { x: number; y: number }
): {
  line: 'outside_off' | 'stumps' | 'outside_leg';
  length: 'full_pitch' | 'good_length' | 'short_of_length' | 'short';
} {
  // Version 2 will segment the PITCH_WIDTH (3.05m) and PITCH_LENGTH (20.12m) to classify
  return {
    line: 'stumps',
    length: 'good_length'
  };
}
