export type TVDirection = 'left' | 'right' | 'up' | 'down';

export interface TVFocusRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX?: number;
  centerY?: number;
}

export interface TVFocusCandidate<T = unknown> {
  rect: TVFocusRect;
  value: T;
}

/**
 * Select the best spatial focus target in a direction.
 *
 * Scoring intentionally prefers predictable TV navigation over Euclidean
 * proximity:
 * 1. candidates whose centre is not in the requested half-plane are rejected;
 * 2. distance along the requested axis is the base cost;
 * 3. perpendicular centre drift costs ~4x as much;
 * 4. leaving the current visual corridor adds a dimension-scaled penalty;
 * 5. very diagonal jumps receive an extra penalty;
 * 6. ties are resolved by geometry and finally by source order.
 *
 * The function is DOM/React-free. Callers collect visible/focusable elements
 * and convert their rectangles to TVFocusRect.
 */
export function findNextFocusTarget<T>(
  current: TVFocusRect,
  candidates: readonly TVFocusCandidate<T>[],
  direction: TVDirection,
): TVFocusCandidate<T> | null {
  const EPSILON = 0.5;

  const normalize = (rect: TVFocusRect) => {
    const values = [
      rect.left,
      rect.top,
      rect.right,
      rect.bottom,
      rect.width,
      rect.height,
    ];
    if (values.some(value => !Number.isFinite(value))) return null;
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (rect.right <= rect.left || rect.bottom <= rect.top) return null;

    const centerX = Number.isFinite(rect.centerX)
      ? rect.centerX!
      : rect.left + rect.width / 2;
    const centerY = Number.isFinite(rect.centerY)
      ? rect.centerY!
      : rect.top + rect.height / 2;

    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;

    return { ...rect, centerX, centerY };
  };

  const origin = normalize(current);
  if (!origin) return null;

  const horizontal = direction === 'left' || direction === 'right';
  const forwardSign = direction === 'right' || direction === 'down' ? 1 : -1;
  const originMainCenter = horizontal ? origin.centerX : origin.centerY;
  const originCrossCenter = horizontal ? origin.centerY : origin.centerX;
  const originCrossStart = horizontal ? origin.top : origin.left;
  const originCrossEnd = horizontal ? origin.bottom : origin.right;
  const originCrossSpan = horizontal ? origin.height : origin.width;

  const ranked: Array<{
    candidate: TVFocusCandidate<T>;
    index: number;
    score: number;
    primaryGap: number;
    primaryCenterDistance: number;
    perpendicularDistance: number;
    top: number;
    left: number;
  }> = [];

  candidates.forEach((candidate, index) => {
    const rect = normalize(candidate.rect);
    if (!rect) return;

    const candidateMainCenter = horizontal ? rect.centerX : rect.centerY;
    const signedCenterDelta =
      (candidateMainCenter - originMainCenter) * forwardSign;

    // Strict directional half-plane: never jump to something geometrically
    // behind the current focus, even when bounding boxes overlap.
    if (signedCenterDelta <= EPSILON) return;

    const candidateCrossCenter = horizontal ? rect.centerY : rect.centerX;
    const candidateCrossStart = horizontal ? rect.top : rect.left;
    const candidateCrossEnd = horizontal ? rect.bottom : rect.right;

    let primaryGap: number;
    if (direction === 'right') {
      primaryGap = Math.max(0, rect.left - origin.right);
    } else if (direction === 'left') {
      primaryGap = Math.max(0, origin.left - rect.right);
    } else if (direction === 'down') {
      primaryGap = Math.max(0, rect.top - origin.bottom);
    } else {
      primaryGap = Math.max(0, origin.top - rect.bottom);
    }

    const perpendicularDistance = Math.abs(
      candidateCrossCenter - originCrossCenter,
    );

    const corridorOverlap = Math.max(
      0,
      Math.min(originCrossEnd, candidateCrossEnd) -
        Math.max(originCrossStart, candidateCrossStart),
    );
    const inVisualCorridor = corridorOverlap > EPSILON;
    const perpendicularGap = inVisualCorridor
      ? 0
      : Math.max(
          0,
          Math.max(
            originCrossStart - candidateCrossEnd,
            candidateCrossStart - originCrossEnd,
          ),
        );

    const corridorPenalty = inVisualCorridor
      ? 0
      : Math.max(120, originCrossSpan * 2) + perpendicularGap * 6;

    // Very diagonal moves are possible as a fallback, but they are expensive.
    const diagonalExcess = Math.max(
      0,
      perpendicularDistance - Math.max(80, signedCenterDelta * 2.5),
    );
    const diagonalPenalty = diagonalExcess * 8;

    const score =
      primaryGap +
      signedCenterDelta * 0.15 +
      perpendicularDistance * 3.75 +
      corridorPenalty +
      diagonalPenalty;

    ranked.push({
      candidate,
      index,
      score,
      primaryGap,
      primaryCenterDistance: signedCenterDelta,
      perpendicularDistance,
      top: rect.top,
      left: rect.left,
    });
  });

  ranked.sort((a, b) =>
    a.score - b.score ||
    a.primaryGap - b.primaryGap ||
    a.perpendicularDistance - b.perpendicularDistance ||
    a.primaryCenterDistance - b.primaryCenterDistance ||
    a.top - b.top ||
    a.left - b.left ||
    a.index - b.index,
  );

  return ranked[0]?.candidate ?? null;
}
