import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";

export function MatrixBackground({ className, sidebarVisible = true }: { className?: string; sidebarVisible?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    const draw = () => {
      const styles = getComputedStyle(document.documentElement);
      const step = Number.parseFloat(styles.getPropertyValue("--pb-cell-size")) || 5;
      const strength = Number.parseFloat(styles.getPropertyValue("--pb-background-cell-shadow")) || 0.42;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const ratio = window.devicePixelRatio || 1;
      const sidebarEdge = sidebarVisible ? document.querySelector<HTMLElement>(".pb-sidebar")?.getBoundingClientRect().right ?? 0 : 0;
      const fadeWidth = Math.max(step, width - sidebarEdge);

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      for (let y = 0; y < height; y += step) {
        for (let x = Math.floor(sidebarEdge / step) * step; x < width; x += step) {
          const rawLevel = 1 - Math.max(0, x + step / 2 - sidebarEdge) / fadeWidth;
          let hash = Math.imul(x / step + 1, 374761393) ^ Math.imul(y / step + 1, 668265263);
          hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
          const threshold = ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
          const level = Math.floor(Math.max(0, rawLevel) * 24 + threshold) / 24;
          if (!level) continue;
          context.fillStyle = `rgb(0 0 0 / ${level * strength})`;
          context.fillRect(x, y, step - 1, step - 1);
        }
      }
    };
    const scheduleDraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    scheduleDraw();
    window.addEventListener("resize", scheduleDraw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleDraw);
    };
  }, [sidebarVisible]);

  return <canvas ref={canvasRef} aria-hidden className={cn("pb-matrix-background", className)} />;
}
