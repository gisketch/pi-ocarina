// @ts-nocheck -- canvas CSS-mask renderer is runtime constrained by Button
import { useCallback, useEffect, useState } from "react";
const cache = new Map();
const token = (styles, name, fallback) => Number.parseFloat(styles.getPropertyValue(name)) || fallback;
function createField(element, mode) {
  const root = getComputedStyle(document.documentElement), style = getComputedStyle(element);
  const cell = token(root, "--pb-cell-size", 5), inline = token(root, "--pb-button-field-inline-spread", 12), block = token(root, "--pb-button-field-block-spread", 10), shades = token(root, "--pb-button-field-shades", 8), radiusFactor = token(root, "--pb-button-field-radius-factor", 0.5);
  const contentWidth = mode === "row" ? element.clientWidth : Math.max(cell, element.clientWidth - token(style, "padding-left", 0) - token(style, "padding-right", 0));
  const contentHeight = mode === "row" ? element.clientHeight : Math.max(cell, Math.min(element.clientHeight, token(style, "line-height", 20)));
  const width = Math.ceil(contentWidth + (mode === "row" ? 0 : inline * 2)), height = Math.ceil(contentHeight + (mode === "row" ? 0 : block * 2));
  const key = [mode, width, height, cell, inline, block, shades, radiusFactor].join(":");
  if (cache.has(key)) return { width, height, mask: cache.get(key) };
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) return { width, height, mask: "none" };
  for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) {
    let hash = Math.imul(x / cell + 1, 374761393) ^ Math.imul(y / cell + 1, 668265263); hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const threshold = ((hash ^ (hash >>> 16)) >>> 0) / 4294967295, radius = Math.min(contentWidth / 2, contentHeight * radiusFactor), qx = Math.abs(x + cell / 2 - width / 2) - (contentWidth / 2 - radius), qy = Math.abs(y + cell / 2 - height / 2) - (contentHeight / 2 - radius), distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
    const alpha = mode === "row" ? 0.55 + threshold * 0.45 : Math.max(0, 1 - Math.max(0, distance) / block), scaled = alpha * shades, level = (Math.floor(scaled) + (threshold < scaled % 1 ? 1 : 0)) / shades;
    if (level) { context.fillStyle = `rgb(255 255 255 / ${level})`; context.fillRect(x, y, cell - 1, cell - 1); }
  }
  const mask = `url("${canvas.toDataURL()}")`; cache.set(key, mask); return { width, height, mask };
}
/** @param {"content" | "row" | false} [mode] */
export function useButtonField(mode = "content") {
  const [element, setElement] = useState(null); const ref = useCallback((node) => setElement(node), []);
  useEffect(() => { if (!element || !mode) return; const draw = () => { const field = createField(element, mode); element.style.setProperty("--pb-button-field-width", `${field.width}px`); element.style.setProperty("--pb-button-field-height", `${field.height}px`); element.style.setProperty("--pb-button-field-mask", field.mask); }; draw(); const observer = new ResizeObserver(draw); observer.observe(element); return () => observer.disconnect(); }, [element, mode]);
  return ref;
}
