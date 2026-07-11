export function matrixPath(cells: string, columns: number, rows: number, cellSize = 4, gap = 1) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns * rows > 4096) throw new RangeError("Matrix dimensions must contain 1–4096 cells");
  if (cells.length !== columns * rows) throw new RangeError("Cell data must match matrix dimensions");
  const pitch = cellSize + gap;
  let path = "";
  for (let index = 0; index < cells.length; index++) {
    if (cells[index] === "0") continue;
    const x = (index % columns) * pitch;
    const y = Math.floor(index / columns) * pitch;
    path += `M${x} ${y}h${cellSize}v${cellSize}h-${cellSize}z`;
  }
  return path;
}

export function matrixSize(cells: number, cellSize = 4, gap = 1) {
  return cells * cellSize + Math.max(0, cells - 1) * gap;
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function matrixTonePaths(cells: string, columns: number, rows: number, seed = cells, cellSize = 4, gap = 1) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns * rows > 4096) throw new RangeError("Matrix dimensions must contain 1–4096 cells");
  if (cells.length !== columns * rows) throw new RangeError("Cell data must match matrix dimensions");
  const paths = ["", "", ""];
  const pitch = cellSize + gap;
  const hash = hashSeed(seed);
  for (let index = 0; index < cells.length; index++) {
    if (cells[index] === "0") continue;
    const roll = (hash + Math.imul(index + 1, -1640531527)) >>> 0;
    const bucket = roll % 5 === 0 ? 0 : roll % 5 === 1 ? 2 : 1;
    const x = (index % columns) * pitch;
    const y = Math.floor(index / columns) * pitch;
    paths[bucket] += `M${x} ${y}h${cellSize}v${cellSize}h-${cellSize}z`;
  }
  return paths as [string, string, string];
}

export function proceduralAvatar(seed: string, size = 5) {
  if (!Number.isInteger(size) || size < 3 || size > 15 || size % 2 === 0) throw new RangeError("Avatar size must be an odd integer from 3–15");
  let state = hashSeed(seed);
  const half = Math.ceil(size / 2);
  const cells = Array<string>(size * size).fill("0");
  for (let y = 0; y < size; y++) for (let x = 0; x < half; x++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const active = state / 2 ** 32 > 0.48 ? "1" : "0";
    cells[y * size + x] = active;
    cells[y * size + size - x - 1] = active;
  }
  return cells.join("");
}

export function avatarColor(seed: string) {
  return `hsl(${hashSeed(seed) % 360} 100% 62%)`;
}
