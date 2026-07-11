import type { CSSProperties, SVGAttributes } from "react";
import { avatarColor, matrixPath, matrixSize, matrixTonePaths, proceduralAvatar } from "./matrix";
import { cn } from "@/shared/lib/utils";

export interface CellMatrixProps extends Omit<SVGAttributes<SVGSVGElement>, "color"> {
  cells: string;
  columns: number;
  rows: number;
  cellSize?: number;
  gap?: number;
  color?: string;
  label?: string;
  tones?: boolean;
  toneSeed?: string;
  glow?: boolean;
}

const toneClasses = ["pb-matrix-tone-dark", "pb-matrix-tone-base", "pb-matrix-tone-light"];

export function CellMatrix({ cells, columns, rows, cellSize = 4, gap = 1, color = "currentColor", label, tones = true, toneSeed, glow = true, className, style, ...props }: CellMatrixProps) {
  const width = matrixSize(columns, cellSize, gap);
  const height = matrixSize(rows, cellSize, gap);
  const fullPath = matrixPath(cells, columns, rows, cellSize, gap);
  const paths = tones ? matrixTonePaths(cells, columns, rows, toneSeed, cellSize, gap) : [matrixPath(cells, columns, rows, cellSize, gap)];
  return <svg aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn("pb-cell-matrix shrink-0", className)} shapeRendering="crispEdges" style={{ color, ...style }} {...props}>{glow && <path d={fullPath} className="pb-matrix-glow-soft" />}{paths.map((path, index) => path && <path key={index} d={path} className={tones ? toneClasses[index] : undefined} fill="currentColor" />)}</svg>;
}

export function ProceduralAvatar({ seed, size = 5, cellSize = 4, gap = 1, color, label, className }: { seed: string; size?: number; cellSize?: number; gap?: number; color?: string; label?: string; className?: string }) {
  return <CellMatrix cells={proceduralAvatar(seed, size)} columns={size} rows={size} cellSize={cellSize} gap={gap} color={color ?? avatarColor(seed)} toneSeed={seed} {...(label === undefined ? {} : { label })} {...(className === undefined ? {} : { className })} />;
}

const spinnerTrailOpacity = [1, 0.64, 0.4, 0.24, 0.12];

export function MatrixSpinner({ size = 4, gap = 2, duration = 800, label = "Loading", className }: { size?: number; gap?: number; duration?: number; label?: string; className?: string }) {
  const width = matrixSize(2, size, gap);
  const height = matrixSize(4, size, gap);
  const step = size + gap;
  return <span role="status" aria-label={label} className={cn("inline-flex text-primary", className)}><svg aria-hidden viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="pb-cell-matrix pb-matrix-spinner" shapeRendering="crispEdges" style={{ "--pb-spinner-step": `${step}px`, "--pb-frame-duration": `${duration}ms` } as CSSProperties}>{spinnerTrailOpacity.map((opacity, index) => <path key={opacity} d={matrixPath("10000000", 2, 4, size, gap)} fill="currentColor" className="pb-matrix-spinner-dot" style={{ "--pb-trail-opacity": opacity, "--pb-trail-delay": `${-((8 - index) * duration) / 8}ms` } as CSSProperties} />)}</svg></span>;
}
