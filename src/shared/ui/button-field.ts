import { useCallback, useEffect, useState, type Ref } from "react";

const maskCache = new Map<string, string>();
const fieldFrames = 4;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

function token(styles: CSSStyleDeclaration, name: string, fallback: number) {
  return Number.parseFloat(styles.getPropertyValue(name)) || fallback;
}

function createField(element: HTMLElement, mode: "content" | "row") {
  const root = getComputedStyle(document.documentElement);
  const cell = token(root, "--pb-cell-size", 5);
  const shades = token(root, "--pb-button-field-shades", 8);
  const width = Math.max(cell, element.clientWidth);
  const height = Math.max(cell, element.clientHeight);
  const key = [mode, width, height, cell, shades].join(":");
  const cached = maskCache.get(key);
  if (cached) return { width, height, mask: cached };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height * fieldFrames;
  const context = canvas.getContext("2d");
  if (!context) return { width, height, mask: "none" };

  for (let frame = 0; frame < fieldFrames; frame++) {
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        let hash = Math.imul(frame + 1, 1597334677) ^ Math.imul(x / cell + 1, 374761393) ^ Math.imul(y / cell + 1, 668265263);
        hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
        const threshold = ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
        const scaled = (0.25 + threshold * 0.75) * shades;
        const level = (Math.floor(scaled) + (threshold < scaled % 1 ? 1 : 0)) / shades;
        if (!level) continue;
        context.fillStyle = `rgb(255 255 255 / ${level})`;
        context.fillRect(x, frame * height + y, cell - 1, cell - 1);
      }
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
      element.style.setProperty("--pb-button-field-mask-size", `100% ${fieldFrames * 100}%`);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, mode]);

  return ref;
}
