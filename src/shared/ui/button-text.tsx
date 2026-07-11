import { Children, cloneElement, isValidElement, type CSSProperties, type ReactNode, type ReactElement } from "react";

function characterCount(node: ReactNode): number {
  if (typeof node === "string" || typeof node === "number") return String(node).length;
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return characterCount(node.props.children);
}

export function StaggeredButtonText({ children, onComplete }: { children: ReactNode; onComplete: () => void }) {
  const total = characterCount(children);
  let index = 0;
  const render = (node: ReactNode): ReactNode => Children.map(node, (child) => {
    if (typeof child === "string" || typeof child === "number") return <span className="pb-button-character-run">{Array.from(String(child)).map((character) => {
      const current = index++;
      return <span key={current} className="pb-button-character" style={{ "--pb-button-character-index": current } as CSSProperties} onAnimationEnd={current === total - 1 ? onComplete : undefined}>{character === " " ? "\u00a0" : character}</span>;
    })}</span>;
    if (!isValidElement<{ children?: ReactNode }>(child) || child.props.children == null) return child;
    return cloneElement(child as ReactElement<{ children?: ReactNode }>, undefined, render(child.props.children));
  });
  return render(children);
}
