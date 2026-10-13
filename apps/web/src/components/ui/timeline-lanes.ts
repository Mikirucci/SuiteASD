/**
 * Puts items on rows so that avatars never cover each other: each item goes on the first row whose
 * last avatar is at least `slot` pixels to the left. `positions` must be sorted ascending.
 * When every row is taken (`maxLanes`), the item shares the row whose last avatar is farthest away.
 */
export function assignLanes(positions: readonly number[], slot: number, maxLanes: number): number[] {
  const lastPosition: number[] = [];
  return positions.map((position) => {
    let lane = lastPosition.findIndex((last) => position - last >= slot);
    if (lane === -1) {
      if (lastPosition.length < maxLanes) {
        lane = lastPosition.length;
      } else {
        lane = lastPosition.indexOf(Math.min(...lastPosition));
      }
    }
    lastPosition[lane] = position;
    return lane;
  });
}
