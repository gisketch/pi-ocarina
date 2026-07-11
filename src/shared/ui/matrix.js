// @ts-nocheck -- direct JavaScript port of the validated COMP LIB matrix renderer
export function matrixPath(cells, columns, rows, cellSize = 4, gap = 1) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns * rows > 4096) throw new RangeError("Matrix dimensions must contain 1–4096 cells");
  if (cells.length !== columns * rows) throw new RangeError("Cell data must match matrix dimensions");
  let path = "";
  const pitch = cellSize + gap;
  for (let index = 0; index < cells.length; index += 1) if (cells[index] !== "0") {
    const x = (index % columns) * pitch;
    const y = Math.floor(index / columns) * pitch;
    path += `M${x} ${y}h${cellSize}v${cellSize}h-${cellSize}z`;
  }
  return path;
}

export const matrixSize = (cells, cellSize = 4, gap = 1) => cells * cellSize + Math.max(0, cells - 1) * gap;

function hashSeed(seed) { let hash = 2166136261; for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619); return hash >>> 0; }

export function matrixTonePaths(cells, columns, rows, seed = cells, cellSize = 4, gap = 1) {
  matrixPath(cells, columns, rows, cellSize, gap);
  const paths = ["", "", ""];
  const pitch = cellSize + gap;
  const hash = hashSeed(seed);
  for (let index = 0; index < cells.length; index += 1) if (cells[index] !== "0") {
    const roll = (hash + Math.imul(index + 1, -1640531527)) >>> 0;
    const bucket = roll % 5 === 0 ? 0 : roll % 5 === 1 ? 2 : 1;
    const x = (index % columns) * pitch;
    const y = Math.floor(index / columns) * pitch;
    paths[bucket] += `M${x} ${y}h${cellSize}v${cellSize}h-${cellSize}z`;
  }
  return paths;
}

export function proceduralAvatar(seed, size = 5) {
  if (!Number.isInteger(size) || size < 3 || size > 15 || size % 2 === 0) throw new RangeError("Avatar size must be an odd integer from 3–15");
  let state = hashSeed(seed);
  const half = Math.ceil(size / 2);
  const cells = Array(size * size).fill("0");
  for (let y = 0; y < size; y += 1) for (let x = 0; x < half; x += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const active = state / 2 ** 32 > 0.48 ? "1" : "0";
    cells[y * size + x] = active;
    cells[y * size + size - x - 1] = active;
  }
  return cells.join("");
}

export const avatarColor = (seed) => `hsl(${hashSeed(seed) % 360} 100% 62%)`;
