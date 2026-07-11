export const BOTTOM_THRESHOLD = 24;

export function isBottomPinned(viewport: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_THRESHOLD;
}
