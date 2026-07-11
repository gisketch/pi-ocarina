// @ts-nocheck -- direct JavaScript port of the validated COMP LIB matrix renderer
import { avatarColor, matrixPath, matrixSize, matrixTonePaths, proceduralAvatar } from "./matrix";
import { cn } from "@/shared/lib/utils";

/** @param {React.SVGAttributes<SVGSVGElement> & { cells: string, columns: number, rows: number, cellSize?: number, gap?: number, color?: string, label?: string, tones?: boolean, toneSeed?: string, glow?: boolean }} props */
export function CellMatrix({ cells, columns, rows, cellSize = 4, gap = 1, color = "currentColor", label, tones = true, toneSeed, glow = true, className, style, ...props }) {
  const width = matrixSize(columns, cellSize, gap), height = matrixSize(rows, cellSize, gap);
  const full = matrixPath(cells, columns, rows, cellSize, gap);
  const paths = tones ? matrixTonePaths(cells, columns, rows, toneSeed, cellSize, gap) : [full];
  const classes = ["pb-matrix-tone-dark", "pb-matrix-tone-base", "pb-matrix-tone-light"];
  return <svg aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn("pb-cell-matrix shrink-0", className)} shapeRendering="crispEdges" style={{ color, ...style }} {...props}>{glow && <path d={full} className="pb-matrix-glow-soft" />}{paths.map((path, index) => path && <path key={index} d={path} className={tones ? classes[index] : undefined} fill="currentColor" />)}</svg>;
}

export function ProceduralAvatar({ seed, size = 5, cellSize = 4, gap = 1, color, label, className = "" }) { return <CellMatrix cells={proceduralAvatar(seed, size)} columns={size} rows={size} cellSize={cellSize} gap={gap} color={color ?? avatarColor(seed)} toneSeed={seed} label={label} className={className} />; }

const trail = [1, 0.64, 0.4, 0.24, 0.12];
export function MatrixSpinner({ size = 4, gap = 2, duration = 800, label = "Loading", className = "" }) {
  const width = matrixSize(2, size, gap), height = matrixSize(4, size, gap), step = size + gap;
  return <span role="status" aria-label={label} className={cn("inline-flex text-primary", className)}><svg aria-hidden viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="pb-cell-matrix pb-matrix-spinner" shapeRendering="crispEdges" style={{ "--pb-spinner-step": `${step}px`, "--pb-frame-duration": `${duration}ms` }}>{trail.map((opacity, index) => <path key={opacity} d={matrixPath("10000000", 2, 4, size, gap)} fill="currentColor" className="pb-matrix-spinner-dot" style={{ "--pb-trail-opacity": opacity, "--pb-trail-delay": `${-((8 - index) * duration) / 8}ms` }} />)}</svg></span>;
}
