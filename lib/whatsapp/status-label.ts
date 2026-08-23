export type WhatsappSidebarState = "connected" | "reconnecting" | "disconnected" | "awaiting_qr" | "error" | "unknown";

/**
 * Traduz o status bruto devolvido por /api/whatsapp/status (espelho do
 * Bridge) para o estado exibido na sidebar. Qualquer valor não reconhecido
 * vira "unknown" — nunca inventamos "conectado".
 */
export function mapBridgeStatus(rawStatus: string | null | undefined): WhatsappSidebarState {
  switch (rawStatus) {
    case "connected":
      return "connected";
    case "reconnecting":
    case "connecting":
      return "reconnecting";
    case "awaiting_qr":
      return "awaiting_qr";
    case "disconnected":
    case "session_closed":
      return "disconnected";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}
