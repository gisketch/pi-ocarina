// @ts-check

export const BOTTOM_THRESHOLD = 24;

/** @param {{ scrollHeight: number, scrollTop: number, clientHeight: number }} viewport */
export function isBottomPinned(viewport) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_THRESHOLD;
}
