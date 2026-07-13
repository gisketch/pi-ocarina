import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

const playedTypewriters = new Set<string>();

export function Typewriter({ children, trailing, onceKey, className, duration = 320, steps = 14 }: { children: string; trailing?: ReactNode; onceKey?: string; className?: string; duration?: number; steps?: number }) {
  const [animate, setAnimate] = useState(() => { if (!onceKey) return true; if (playedTypewriters.has(onceKey)) return false; playedTypewriters.add(onceKey); return true; });
  const style = { "--pb-typewriter-duration": `${duration}ms`, "--pb-typewriter-steps": steps } as CSSProperties;
  return <span className={cn("pb-typewriter", className)} data-animate={animate} style={style}><span className="pb-typewriter-stage"><span className="pb-typewriter-text" onAnimationEnd={() => { if (!trailing) setAnimate(false); }}>{children}</span>{animate && <span aria-hidden className="pb-typewriter-caret">_</span>}</span>{trailing && <span className="pb-typewriter-trailing" onAnimationEnd={() => setAnimate(false)}>{trailing}</span>}</span>;
}
