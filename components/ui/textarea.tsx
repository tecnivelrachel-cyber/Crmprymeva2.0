import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300",
        "transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400 focus-visible:border-navy-400",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
