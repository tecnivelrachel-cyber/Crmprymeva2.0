export const SOUND_PREFERENCE_KEY = "prymeva:alert-sound";
export const ALERTS_ENABLED_KEY = "prymeva:alerts-enabled";

/** Ausência de preferência salva = ligado. O som só toca de fato depois do desbloqueio por gesto do usuário. */
export function parseSoundPreference(raw: string | null): boolean {
  return raw !== "false";
}

export function parseAlertsEnabled(raw: string | null): boolean {
  return raw === "true";
}
