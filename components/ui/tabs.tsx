"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-surface-border", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            value === tab.value
              ? "border-navy-700 text-navy-700"
              : "border-transparent text-ink-500 hover:text-ink-900"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
