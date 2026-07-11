import { useLayoutEffect, useRef, type ReactNode } from "react";

import { isBottomPinned } from "./transcript-scroll";

/** @param {{ threadKey: string, savedTop?: number, contentKey: unknown, onPosition: (top: number) => void, children: React.ReactNode }} props */
export function TranscriptViewport({ threadKey, savedTop, contentKey, onPosition, children }: { threadKey: string; savedTop?: number; contentKey: unknown; onPosition: (top: number) => void; children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(savedTop == null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.style.visibility = "hidden";
    viewport.scrollTop = savedTop ?? viewport.scrollHeight;
    pinnedRef.current = savedTop == null || isBottomPinned(viewport);
    viewport.style.visibility = "visible";
  }, [threadKey, savedTop]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && pinnedRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [contentKey]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [threadKey]);

  return <div
    className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
    data-testid="timeline"
    ref={viewportRef}
    onScroll={(event) => {
      pinnedRef.current = isBottomPinned(event.currentTarget);
      onPosition(event.currentTarget.scrollTop);
    }}
  ><div className="mx-auto w-full max-w-4xl space-y-3 px-2 py-4 [&>*]:[content-visibility:auto] [&>*]:[contain-intrinsic-size:auto_5rem]" ref={contentRef}>{children}</div></div>;
}
