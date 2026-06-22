export interface Point {
  x: number;
  y: number;
}

export interface TrajectoryPoint {
  frame: number;
  x: number;
  y: number;
}

export interface WicketBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CalibrationData {
  pitchPoints: Point[];
  wicketBox: WicketBox;
  homography: number[] | null;
  invHomography: number[] | null;
  timestamp: number;
}

export interface LBWDecision {
  decision: 'HITTING' | 'MISSING' | 'UNKNOWN';
  bounceFrame?: number;
  bouncePoint?: Point;
  bouncePointMeters?: Point;
  impactFrame?: number;
  impactPoint?: Point;
  impactPointMeters?: Point;
  trajectoryConfidence: number; // 0 to 100
  predictedTrajectory?: TrajectoryPoint[];
}

export interface BowlingAnalytics {
  speedKmh: number;
  avgSpeedKmh: number;
  line: 'outside_off' | 'stumps' | 'outside_leg';
  length: 'full_pitch' | 'good_length' | 'short_of_length' | 'short';
  pitchPointMeters?: Point;
}

export interface QuadraticCoefficients {
  a: number; // coefficient for t^2
  b: number; // coefficient for t
  c: number; // constant
}

