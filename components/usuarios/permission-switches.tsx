"use client";

import { Switch } from "@/components/ui/switch";
import { PERMISSION_GROUPS, PERMISSION_LABELS, type PermissionsMap } from "@/types/permissions";

interface PermissionSwitchesProps {
  value: PermissionsMap;
  onChange: (value: PermissionsMap) => void;
  disabled?: boolean;
}

export function PermissionSwitches({ value, onChange, disabled }: PermissionSwitchesProps) {
  return (
    <div className="space-y-5">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{group.label}</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.permissions.map((permission) => (
              <label
                key={permission}
                className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-3 py-2.5"
              >
                <span className="text-sm text-ink-700">{PERMISSION_LABELS[permission]}</span>
                <Switch
                  checked={value[permission] === true}
                  onCheckedChange={(checked) => onChange({ ...value, [permission]: checked })}
                  disabled={disabled}
                  label={PERMISSION_LABELS[permission]}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
