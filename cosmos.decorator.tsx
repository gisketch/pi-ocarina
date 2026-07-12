import type { ReactNode } from "react";
import { TooltipProvider } from "@/shared/ui/tooltip";
import "./src/styles.css";

export default function CosmosDecorator({ children }: { children: ReactNode }) {
  return <TooltipProvider><div className="min-h-screen bg-background p-6 text-foreground">{children}</div></TooltipProvider>;
}
