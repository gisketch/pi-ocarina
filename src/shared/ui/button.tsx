import { Slot } from "radix-ui";
import type { ComponentProps, Ref } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";
import { useButtonField } from "./button-field";

const buttonVariants = cva("pb-button-interaction group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-transparent bg-clip-padding font-button text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_[data-slot=icon]]:pointer-events-none [&_[data-slot=icon]]:shrink-0", { variants: {
  variant: { default: "text-primary hover:bg-transparent", destructive: "text-destructive hover:bg-transparent focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40", outline: "border-border text-foreground hover:bg-transparent aria-expanded:bg-transparent aria-expanded:text-foreground", secondary: "text-secondary hover:bg-transparent aria-expanded:bg-transparent", ghost: "text-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-foreground", link: "text-primary underline-offset-4 hover:underline" },
  size: { default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2", xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_[data-slot=icon]]:size-3", sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_[data-slot=icon]]:size-3.5", lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2", icon: "size-8", "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_[data-slot=icon]]:size-3", "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg", "icon-lg": "size-9" },
}, defaultVariants: { variant: "default", size: "default" } });

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  asChild?: boolean;
  effects?: "default" | "motion-only" | "row-highlight";
};

function Button({ className, variant = "default", size = "default", asChild = false, effects = "default", ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  const fieldRef = useButtonField(ref as Ref<HTMLElement>, effects === "motion-only" ? false : effects === "row-highlight" ? "row" : "content");
  return <Comp ref={fieldRef} data-slot="button" data-variant={variant} data-size={size} data-effects={effects} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
export { Button, buttonVariants, type ButtonProps };
