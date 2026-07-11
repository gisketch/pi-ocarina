// @ts-check
import { Slot } from "radix-ui";
import { useState } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";
import { useButtonField } from "./button-field";
import { StaggeredButtonText } from "./button-text";

const buttonVariants = cva("pb-button-interaction inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent font-button text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&_[data-slot=icon]]:pointer-events-none [&_[data-slot=icon]]:shrink-0", { variants: {
  variant: { default: "text-primary", destructive: "text-destructive", outline: "border-border text-foreground", secondary: "text-secondary", ghost: "text-foreground", link: "text-primary underline-offset-4 hover:underline" },
  size: { default: "h-8 px-2.5", xs: "h-6 gap-1 px-2 text-xs", sm: "h-7 px-2.5 text-xs", lg: "h-9 px-3", icon: "size-8", "icon-xs": "size-6", "icon-sm": "size-7", "icon-lg": "size-9" },
}, defaultVariants: { variant: "default", size: "default" } });

/** @param {React.ComponentProps<"button"> & { variant?: "default"|"destructive"|"outline"|"secondary"|"ghost"|"link", size?: "default"|"xs"|"sm"|"lg"|"icon"|"icon-xs"|"icon-sm"|"icon-lg", asChild?: boolean, effects?: "default"|"motion-only"|"row-highlight" }} props */
function Button({ className, variant = "default", size = "default", asChild = false, effects = "default", children, onPointerEnter, ...props }) {
  const Comp = asChild ? Slot.Root : "button";
  const fieldRef = useButtonField(effects === "motion-only" ? false : effects === "row-highlight" ? "row" : "content");
  const [revealing, setRevealing] = useState(false);
  return <Comp ref={fieldRef} data-slot="button" data-variant={variant} data-size={size} data-effects={effects} onPointerEnter={(event) => { if (effects === "default") setRevealing(true); onPointerEnter?.(event); }} className={cn(buttonVariants({ variant, size }), className)} {...props}>{!asChild && effects === "default" && revealing ? <StaggeredButtonText onComplete={() => setRevealing(false)}>{children}</StaggeredButtonText> : children}</Comp>;
}
export { Button, buttonVariants };
