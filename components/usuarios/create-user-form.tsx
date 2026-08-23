"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PermissionSwitches } from "./permission-switches";
import { createUserSchema, type CreateUserInput } from "@/lib/validation/schemas";
import { createUserAction } from "@/app/(crm)/usuarios/actions";
import { POST_SALE_ONLY_PRESET_PERMISSIONS, type PermissionsMap } from "@/types/permissions";

function buildPostSaleOnlyPreset(): PermissionsMap {
  return Object.fromEntries(POST_SALE_ONLY_PRESET_PERMISSIONS.map((p) => [p, true]));
}

export function CreateUserForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { is_admin: false, permissions: {}, access_scope: null },
  });

  const permissions = watch("permissions") ?? {};
  const isAdmin = watch("is_admin") ?? false;
  const isPostSaleOnly = watch("access_scope") === "post_sale_only";

  function handleTogglePostSaleOnly(checked: boolean) {
    setValue("access_scope", checked ? "post_sale_only" : null);
    if (checked) setValue("permissions", buildPostSaleOnlyPreset());
  }

  async function onSubmit(values: CreateUserInput) {
    setServerError(null);
    const result = await createUserAction(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.push("/usuarios");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nome completo</Label>
          <Input id="full_name" {...register("full_name")} />
          {errors.full_name && <p className="text-xs text-danger">{errors.full_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="job_title">Cargo</Label>
          <Input id="job_title" {...register("job_title")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="off" {...register("email")} />
          {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha provisória</Label>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-ink-900">Administrador</p>
          <p className="text-xs text-ink-500">Administradores têm acesso total, ignorando as permissões abaixo.</p>
        </div>
        <Switch checked={isAdmin} onCheckedChange={(v) => setValue("is_admin", v)} label="Administrador" />
      </label>

      {!isAdmin && (
        <label className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-ink-900">Restringir ao Pós-venda</p>
            <p className="text-xs text-ink-500">
              Bloqueia rotas e dados Comerciais no servidor e aplica o conjunto de permissões de Pós-venda abaixo.
            </p>
          </div>
          <Switch checked={isPostSaleOnly} onCheckedChange={handleTogglePostSaleOnly} label="Restringir ao Pós-venda" />
        </label>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-900">Permissões</h3>
        <PermissionSwitches value={permissions} onChange={(v) => setValue("permissions", v)} disabled={isAdmin} />
      </div>

      {serverError && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {serverError}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/usuarios")}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          Criar usuário
        </Button>
      </div>
    </form>
  );
}
