import { ALL_PERMISSIONS, type Permission, type PermissionsMap } from "@/types/permissions";
import type { Profile } from "@/types/database";

/**
 * Espelha a função has_permission() do banco (ver 001_initial_schema.sql).
 * Usada para checagens no servidor e para mostrar/ocultar itens na interface.
 * IMPORTANTE: isto NUNCA substitui a validação por RLS — é só uma conveniência
 * de UI e uma camada extra de defesa nas rotas de API.
 */
export function hasPermission(
  profile: Pick<Profile, "is_admin" | "is_active" | "permissions"> | null | undefined,
  permission: Permission
): boolean {
  if (!profile || !profile.is_active) return false;
  if (profile.is_admin) return true;
  return profile.permissions?.[permission] === true;
}

export function hasAnyPermission(
  profile: Pick<Profile, "is_admin" | "is_active" | "permissions"> | null | undefined,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(profile, p));
}

export function canViewAssigned(
  profile: Pick<Profile, "id"> | null | undefined,
  assignedUserId: string | null
): boolean {
  return !!profile && !!assignedUserId && profile.id === assignedUserId;
}

/** Permissões completas do administrador — usado ao criar o perfil no seed. */
export function fullPermissionsMap(): PermissionsMap {
  return Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, true])) as PermissionsMap;
}
