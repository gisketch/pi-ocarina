// @ts-nocheck -- canvas element is locally owned and checked before use
import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";
export function MatrixBackground({ className = "" }) {
  const canvasRef = useRef(null);
  useEffect(() => { const canvas = canvasRef.current, context = canvas?.getContext("2d"); if (!canvas || !context) return; let frame = 0;
    const draw = () => { const styles = getComputedStyle(document.documentElement), step = Number.parseFloat(styles.getPropertyValue("--pb-cell-size")) || 5, strength = Number.parseFloat(styles.getPropertyValue("--pb-background-cell-glow")) || 0.05, width = innerWidth, height = innerHeight, ratio = devicePixelRatio || 1; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height); for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) { const raw = 1 - Math.hypot((x + step / 2 - width / 2) / (width * 0.58), (y + step / 2) / (height * 0.58)); let hash = Math.imul(x / step + 1, 374761393) ^ Math.imul(y / step + 1, 668265263); hash = Math.imul(hash ^ (hash >>> 13), 1274126177); const level = Math.floor(Math.max(0, raw) * 24 + ((hash ^ (hash >>> 16)) >>> 0) / 4294967295) / 24; if (level) { context.fillStyle = `rgb(255 255 255 / ${level * strength})`; context.fillRect(x, y, step - 1, step - 1); } } };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); }; schedule(); addEventListener("resize", schedule); return () => { cancelAnimationFrame(frame); removeEventListener("resize", schedule); };
  }, []);
  return <canvas ref={canvasRef} aria-hidden className={cn("pb-matrix-background", className)} />;
}
