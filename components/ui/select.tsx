import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full appearance-none rounded-xl border border-surface-border bg-white px-3 pr-9 text-sm text-ink-900",
          "transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400 focus-visible:border-navy-400",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-300" />
    </div>
  )
);
Select.displayName = "Select";
