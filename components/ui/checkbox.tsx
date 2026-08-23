import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => (
  <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "peer h-5 w-5 shrink-0 appearance-none rounded-md border border-surface-border bg-white",
        "checked:border-navy-700 checked:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
    <Check size={13} strokeWidth={3} className="pointer-events-none absolute hidden text-white peer-checked:block" />
  </span>
));
Checkbox.displayName = "Checkbox";
