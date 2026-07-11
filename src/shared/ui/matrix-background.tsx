import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";

export function MatrixBackground({ className }: { className?: string }) {
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
      const strength = Number.parseFloat(styles.getPropertyValue("--pb-background-cell-glow")) || 0.05;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const distance = Math.hypot((x + step / 2 - width / 2) / (width * 0.58), (y + step / 2) / (height * 0.58));
          const rawLevel = 1 - distance;
          let hash = Math.imul(x / step + 1, 374761393) ^ Math.imul(y / step + 1, 668265263);
          hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
          const threshold = ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
          const level = Math.floor(Math.max(0, rawLevel) * 24 + threshold) / 24;
          if (!level) continue;
          context.fillStyle = `rgb(255 255 255 / ${level * strength})`;
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
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={cn("pb-matrix-background", className)} />;
}
