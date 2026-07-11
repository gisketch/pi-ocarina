// @ts-nocheck -- recursive React-node transform is runtime constrained by Button
import { Children, cloneElement, isValidElement } from "react";

function count(node) { if (typeof node === "string" || typeof node === "number") return String(node).length; return isValidElement(node) ? count(node.props.children) : 0; }
export function StaggeredButtonText({ children, onComplete }) {
  const total = count(children); let index = 0;
  const render = (node) => Children.map(node, (child) => {
    if (typeof child === "string" || typeof child === "number") return <span className="pb-button-character-run">{Array.from(String(child)).map((character) => { const current = index++; return <span key={current} className="pb-button-character" style={{ "--pb-button-character-index": current }} onAnimationEnd={current === total - 1 ? onComplete : undefined}>{character === " " ? "\u00a0" : character}</span>; })}</span>;
    return !isValidElement(child) || child.props.children == null ? child : cloneElement(child, undefined, render(child.props.children));
  });
  return render(children);
}
