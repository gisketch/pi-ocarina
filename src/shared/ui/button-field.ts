import { useCallback, useEffect, useState, type Ref } from "react";

const maskCache = new Map<string, string>();

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

function token(styles: CSSStyleDeclaration, name: string, fallback: number) {
  return Number.parseFloat(styles.getPropertyValue(name)) || fallback;
}

function createField(element: HTMLElement, mode: "content" | "row") {
  const root = getComputedStyle(document.documentElement);
  const style = getComputedStyle(element);
  const cell = token(root, "--pb-cell-size", 5);
  const inline = token(root, "--pb-button-field-inline-spread", 12);
  const block = token(root, "--pb-button-field-block-spread", 10);
  const shades = token(root, "--pb-button-field-shades", 8);
  const radiusFactor = token(root, "--pb-button-field-radius-factor", 0.5);
  const contentWidth = mode === "row" ? element.clientWidth : Math.max(cell, element.clientWidth - token(style, "padding-left", 0) - token(style, "padding-right", 0));
  const contentHeight = mode === "row" ? element.clientHeight : Math.max(cell, Math.min(element.clientHeight, token(style, "line-height", 20)));
  const width = Math.ceil(contentWidth + (mode === "row" ? 0 : inline * 2));
  const height = Math.ceil(contentHeight + (mode === "row" ? 0 : block * 2));
  const key = [mode, width, height, cell, inline, block, shades, radiusFactor].join(":");
  const cached = maskCache.get(key);
  if (cached) return { width, height, mask: cached };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return { width, height, mask: "none" };

  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      let hash = Math.imul(x / cell + 1, 374761393) ^ Math.imul(y / cell + 1, 668265263);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      const threshold = ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
      const radius = Math.min(contentWidth / 2, contentHeight * radiusFactor);
      const qx = Math.abs(x + cell / 2 - width / 2) - (contentWidth / 2 - radius);
      const qy = Math.abs(y + cell / 2 - height / 2) - (contentHeight / 2 - radius);
      const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      const alpha = mode === "row" ? 0.55 + threshold * 0.45 : Math.max(0, 1 - Math.max(0, distance) / block);
      const scaled = alpha * shades;
      const level = (Math.floor(scaled) + (threshold < scaled % 1 ? 1 : 0)) / shades;
      if (!level) continue;
      context.fillStyle = `rgb(255 255 255 / ${level})`;
      context.fillRect(x, y, cell - 1, cell - 1);
    }
  }

  const mask = `url("${canvas.toDataURL()}")`;
  maskCache.set(key, mask);
  return { width, height, mask };
}

export function useButtonField<T extends HTMLElement>(forwardedRef?: Ref<T>, mode: "content" | "row" | false = "content") {
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => { setElement(node); assignRef(forwardedRef, node); }, [forwardedRef]);

  useEffect(() => {
    if (!element || !mode) return;
    const draw = () => {
      const field = createField(element, mode);
      element.style.setProperty("--pb-button-field-width", `${field.width}px`);
      element.style.setProperty("--pb-button-field-height", `${field.height}px`);
      element.style.setProperty("--pb-button-field-mask", field.mask);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, mode]);

  return ref;
}
