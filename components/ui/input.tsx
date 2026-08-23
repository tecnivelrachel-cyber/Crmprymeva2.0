import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-surface-border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300",
        "transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400 focus-visible:border-navy-400",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
