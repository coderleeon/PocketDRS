import { Point, QuadraticCoefficients } from '@/core/types';

/**
 * Calculates the cross product of two vectors (p1 -> p2) and (p1 -> p3).
 * Used to determine the winding direction.
 */
function crossProduct(p1: Point, p2: Point, p3: Point): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
}

/**
 * Checks if a quadrilateral defined by 4 points is convex.
 * Points must be ordered sequentially (clockwise or counter-clockwise).
 */
export function isConvex(points: Point[]): boolean {
  if (points.length !== 4) return false;

  const cp1 = crossProduct(points[0], points[1], points[2]);
  const cp2 = crossProduct(points[1], points[2], points[3]);
  const cp3 = crossProduct(points[2], points[3], points[0]);
  const cp4 = crossProduct(points[3], points[0], points[1]);

  const allPositive = cp1 > 0 && cp2 > 0 && cp3 > 0 && cp4 > 0;
  const allNegative = cp1 < 0 && cp2 < 0 && cp3 < 0 && cp4 < 0;

  return allPositive || allNegative;
}

/**
 * Calculates the area of a polygon using the Shoelace formula.
 */
export function getPolygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculates the Euclidean distance between two points.
 */
export function getDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Analyzes the pitch calibration points and calculates an AR alignment confidence percentage (0-100)
 * along with status details and suggestions.
 * 
 * Assumed Ordering of points:
 * 0: Far-Left (Bowler's end, left)
 * 1: Far-Right (Bowler's end, right)
 * 2: Near-Right (Batsman's end, right)
 * 3: Near-Left (Batsman's end, left)
 */
export function calculateAlignmentConfidence(
  points: Point[],
  viewportWidth: number,
  viewportHeight: number
): {
  confidence: number;
  status: 'poor' | 'fair' | 'good' | 'excellent';
  reasons: string[];
} {
  if (points.length !== 4) {
    return { confidence: 0, status: 'poor', reasons: ['Requires exactly 4 points.'] };
  }

  // 1. Convexity check (critical)
  if (!isConvex(points)) {
    return {
      confidence: 0,
      status: 'poor',
      reasons: ['Pitch shape is self-intersecting or concave. Check corner order.'],
    };
  }

  const reasons: string[] = [];
  let score = 100;

  const farWidth = getDistance(points[0], points[1]);
  const nearWidth = getDistance(points[3], points[2]);
  const leftLength = getDistance(points[0], points[3]);
  const rightLength = getDistance(points[1], points[2]);

  // 2. Aspect Ratio Tapering (Perspective check)
  // In a standard rear-view camera setup, the near width should be larger than the far width.
  if (nearWidth <= farWidth) {
    score -= 30;
    reasons.push('Pitch does not taper in perspective (far end is wider than near end).');
  } else {
    // Tapering ratio should be moderate (nearWidth should be 1.2x to 3.0x farWidth)
    const taperRatio = nearWidth / farWidth;
    if (taperRatio > 4.0) {
      score -= 15;
      reasons.push('Perspective is extremely skewed (tapering is too steep).');
    }
  }

  // 3. Side symmetry check
  // The left and right lengths of the pitch should be relatively balanced.
  const lengthRatio = Math.max(leftLength, rightLength) / Math.min(leftLength, rightLength);
  if (lengthRatio > 1.5) {
    score -= 20;
    reasons.push('Camera alignment is heavily rotated sideways.');
  }

  // 4. Area Check
  // Ensure the calibrated pitch occupies a reasonable portion of the screen (not too tiny or too huge).
  const screenArea = viewportWidth * viewportHeight;
  const pitchArea = getPolygonArea(points);
  const coverage = pitchArea / screenArea;

  if (coverage < 0.05) {
    score -= 25;
    reasons.push('Calibrated pitch area is too small relative to the viewport.');
  } else if (coverage > 0.8) {
    score -= 15;
    reasons.push('Calibrated pitch area covers too much of the screen; reduce corner boundaries.');
  }

  // Bound score
  const finalConfidence = Math.max(0, Math.min(100, score));
  let status: 'poor' | 'fair' | 'good' | 'excellent' = 'poor';

  if (finalConfidence >= 85) {
    status = 'excellent';
  } else if (finalConfidence >= 65) {
    status = 'good';
  } else if (finalConfidence >= 40) {
    status = 'fair';
  }

  if (reasons.length === 0) {
    reasons.push('Good camera perspective and pitch alignment.');
  }

  return {
    confidence: finalConfidence,
    status,
    reasons,
  };
}

/**
 * Ray-casting algorithm to check if a point lies inside a polygon of vertices.
 */
export function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;

    const intersect = ((yi > pt.y) !== (yj > pt.y))
        && (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Fits a quadratic curve (u = a*t^2 + b*t + c) to a set of points (t_i, u_i)
 * using least-squares regression.
 */
export function fitQuadraticCurve(
  timeSeries: { t: number; val: number }[]
): QuadraticCoefficients | null {
  const n = timeSeries.length;
  if (n < 3) return null; // Needs at least 3 points to define a parabola

  let sumT = 0, sumT2 = 0, sumT3 = 0, sumT4 = 0;
  let sumV = 0, sumTV = 0, sumT2V = 0;

  for (const { t, val } of timeSeries) {
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;

    sumT += t;
    sumT2 += t2;
    sumT3 += t3;
    sumT4 += t4;

    sumV += val;
    sumTV += t * val;
    sumT2V += t2 * val;
  }

  // Set up the matrix system:
  // | sumT4  sumT3  sumT2 |   | a |   | sumT2V |
  // | sumT3  sumT2  sumT  | * | b | = | sumTV  |
  // | sumT2  sumT   n     |   | c |   | sumV   |

  const m00 = sumT4, m01 = sumT3, m02 = sumT2;
  const m10 = sumT3, m11 = sumT2, m12 = sumT;
  const m20 = sumT2, m21 = sumT,  m22 = n;

  const y0 = sumT2V;
  const y1 = sumTV;
  const y2 = sumV;

  // Compute determinant of M using Cramer's rule
  const detM = m00 * (m11 * m22 - m12 * m21) -
               m01 * (m10 * m22 - m12 * m20) +
               m02 * (m10 * m21 - m11 * m20);

  if (Math.abs(detM) < 1e-5) {
    // If matrix is singular, fallback to linear fit
    return null;
  }

  // Compute determinants for coefficients
  const detA = y0 * (m11 * m22 - m12 * m21) -
               m01 * (y1 * m22 - m12 * y2) +
               m02 * (y1 * m21 - m11 * y2);

  const detB = m00 * (y1 * m22 - m12 * y2) -
               y0 * (m10 * m22 - m12 * m20) +
               m02 * (m10 * y2 - y1 * m20);

  const detC = m00 * (m11 * y2 - y1 * m21) -
               m01 * (m10 * y2 - y1 * m20) +
               y0 * (m10 * m21 - m11 * m20);

  return {
    a: detA / detM,
    b: detB / detM,
    c: detC / detM
  };
}
