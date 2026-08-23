import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-navy-400",
  {
    variants: {
      variant: {
        primary: "bg-navy-700 text-white hover:bg-navy-600 shadow-soft",
        cta: "bg-accent-500 text-white hover:bg-accent-600 shadow-soft",
        secondary: "bg-sky-100 text-navy-700 hover:bg-sky-200",
        outline: "border border-surface-border bg-white text-ink-700 hover:bg-surface-muted",
        ghost: "text-ink-700 hover:bg-surface-muted",
        destructive: "bg-danger text-white hover:opacity-90",
        link: "text-navy-700 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
