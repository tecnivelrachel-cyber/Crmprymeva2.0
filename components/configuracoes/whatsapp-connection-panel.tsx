"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Loader2, Smartphone, Power, Trash2, QrCode } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConnectionStatus =
  | "disconnected"
  | "awaiting_qr"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "session_closed"
  | "error"
  | "unavailable";

interface StatusResponse {
  status: ConnectionStatus;
  connectedNumber: string | null;
  deviceName: string | null;
  connectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  configured?: boolean;
  mockMode?: boolean;
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Desconectado",
  awaiting_qr: "Aguardando leitura do QR Code",
  connecting: "Conectando",
  connected: "Conectado",
  reconnecting: "Reconectando",
  session_closed: "Sessão encerrada pelo celular",
  error: "Erro",
  unavailable: "Bridge indisponível ou demorou para responder",
};

const STATUS_BADGE: Record<ConnectionStatus, "success" | "warning" | "neutral" | "danger"> = {
  disconnected: "neutral",
  awaiting_qr: "warning",
  connecting: "warning",
  connected: "success",
  reconnecting: "warning",
  session_closed: "danger",
  error: "danger",
  unavailable: "danger",
};

// O QR do WhatsApp expira em ~60s. Depois disso removemos da tela e pedimos
// que o usuário gere um novo manualmente — nunca renovamos sozinhos.
const QR_TTL_MS = 60_000;
// Depois de clicar em "Gerar QR Code", o Bridge leva alguns segundos para
// produzir o QR. Buscamos algumas vezes (bounded) só até obter o primeiro —
// isto NÃO é renovação automática: para assim que o QR aparece ou quando
// esgota a janela de aquisição.
const QR_ACQUIRE_ATTEMPTS = 8;
const QR_ACQUIRE_INTERVAL_MS = 1500;
// Verificação leve de status — só para refletir "Conectado"/"Desconectado";
// nunca inicia nem reinicia sessão.
const STATUS_POLL_MS = 6000;

interface WhatsappConnectionPanelProps {
  /** Qual conta esta instância do painel controla — nunca mistura Comercial e Pós-venda numa mesma chamada. */
  purpose: "commercial" | "post_sale";
}

export function WhatsappConnectionPanel({ purpose }: WhatsappConnectionPanelProps) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<"disconnect" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Timers de aquisição/expiração do QR vivem em refs para poderem ser
  // cancelados de forma limpa (troca de página, conexão, clique de novo).
  const acquireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guarda contra duas gerações simultâneas da MESMA sessão (clique duplo /
  // corrida) — checado de forma síncrona, antes de qualquer await.
  const generatingRef = useRef(false);
  // Evita setState depois do unmount (troca de página no meio de um fetch).
  const mountedRef = useRef(true);

  const clearQrTimers = useCallback(() => {
    if (acquireTimerRef.current) {
      clearTimeout(acquireTimerRef.current);
      acquireTimerRef.current = null;
    }
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/status?purpose=${purpose}`, { cache: "no-store" });
      const json = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setError(json.error ?? "Falha ao consultar status.");
        return;
      }
      setError(null);
      setData(json);
    } catch {
      if (mountedRef.current) setError("Falha ao consultar status.");
    }
  }, [purpose]);

  // Verificação leve de status só na montagem + polling lento. NUNCA busca QR
  // aqui e NUNCA inicia sessão — só lê o estado atual do Bridge.
  useEffect(() => {
    mountedRef.current = true;
    fetchStatus();
    const interval = setInterval(fetchStatus, STATUS_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      clearQrTimers();
    };
  }, [fetchStatus, clearQrTimers]);

  // Quando a sessão conecta, o QR não faz mais sentido: remove da tela,
  // cancela os timers pendentes e encerra a tentativa. Idem se o Bridge sai
  // de qualquer estado que justificasse mostrar QR.
  useEffect(() => {
    if (data?.status === "connected") {
      clearQrTimers();
      setQr(null);
      setQrExpired(false);
      setGenerating(false);
      generatingRef.current = false;
    }
  }, [data?.status, clearQrTimers]);

  // Busca o QR uma única vez (parte da aquisição inicial disparada pelo botão).
  const fetchQrOnce = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`/api/whatsapp/qr?purpose=${purpose}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.qr) return json.qr as string;
    } catch {
      // silencioso — o chamador decide se tenta de novo dentro da janela
    }
    return null;
  }, [purpose]);

  function startExpiryCountdown() {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      // Expirou: remove o QR e mostra "Gerar novo QR Code". Nunca renova sozinho.
      setQr(null);
      setQrExpired(true);
    }, QR_TTL_MS);
  }

  // Aquisição bounded do QR após o connect — tenta N vezes até obter o
  // primeiro QR, depois PARA. Se conectar no meio, o efeito de "connected"
  // já terá limpado tudo.
  const acquireQr = useCallback(
    (attempt: number) => {
      acquireTimerRef.current = setTimeout(
        async () => {
          if (!mountedRef.current || !generatingRef.current) return;
          const code = await fetchQrOnce();
          if (!mountedRef.current || !generatingRef.current) return;
          if (code) {
            setQr(code);
            setGenerating(false);
            generatingRef.current = false;
            startExpiryCountdown();
            return;
          }
          if (attempt + 1 < QR_ACQUIRE_ATTEMPTS) {
            acquireQr(attempt + 1);
          } else {
            // Não conseguiu obter o QR na janela — para e deixa o usuário
            // tentar de novo manualmente. Nada é renovado automaticamente.
            setGenerating(false);
            generatingRef.current = false;
            setError("Não foi possível obter o QR Code agora. Clique em “Gerar QR Code” para tentar de novo.");
          }
        },
        attempt === 0 ? 0 : QR_ACQUIRE_INTERVAL_MS
      );
    },
    [fetchQrOnce]
  );

  async function handleGenerateQr() {
    // Clique duplo / corrida: se já está gerando, ignora silenciosamente.
    if (generatingRef.current || loadingAction) return;
    generatingRef.current = true;
    setGenerating(true);
    setQr(null);
    setQrExpired(false);
    setError(null);
    clearQrTimers();
    setLoadingAction("connect");
    try {
      const res = await fetch(`/api/whatsapp/connect?purpose=${purpose}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Falha ao iniciar conexão.");
        setGenerating(false);
        generatingRef.current = false;
        return;
      }
      await fetchStatus();
      acquireQr(0);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDisconnect() {
    setLoadingAction("disconnect");
    try {
      await fetch(`/api/whatsapp/disconnect?purpose=${purpose}`, { method: "POST" });
      clearQrTimers();
      setQr(null);
      setQrExpired(false);
      setConfirmMode(null);
      await fetchStatus();
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDeleteSession() {
    setLoadingAction("delete");
    try {
      await fetch(`/api/whatsapp/session?purpose=${purpose}`, { method: "DELETE" });
      clearQrTimers();
      setQr(null);
      setQrExpired(false);
      setConfirmMode(null);
      await fetchStatus();
    } finally {
      setLoadingAction(null);
    }
  }

  if (!data) {
    if (error) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Status da conexão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-2">
            <Badge variant="danger">Não foi possível falar com o WhatsApp Bridge</Badge>
            <p className="text-sm text-ink-500">{error}</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-ink-400" />
        </CardContent>
      </Card>
    );
  }

  if (data.mockMode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Status da conexão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-2">
          <Badge variant="warning">Modo simulado (WHATSAPP_MOCK_MODE=true)</Badge>
          <p className="text-sm text-ink-500">
            Envio e recebimento estão simulados. Defina WHATSAPP_MOCK_MODE=false e configure o WhatsApp Bridge para
            conectar um número real por QR Code.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data.configured) {
    const apiKeyVar = purpose === "commercial" ? "WHATSAPP_BRIDGE_COMMERCIAL_API_KEY" : "WHATSAPP_BRIDGE_POST_SALE_API_KEY";
    return (
      <Card>
        <CardHeader>
          <CardTitle>Status da conexão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-2">
          <Badge variant="danger">WhatsApp Bridge não configurado</Badge>
          <p className="text-sm text-ink-500">
            Confirme whatsapp_accounts.bridge_url para esta conta e a variável {apiKeyVar} no ambiente de produção.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isConnected = data.status === "connected";
  const busyGenerating = generating || loadingAction === "connect";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Status da conexão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-700">Status</span>
            <Badge variant={STATUS_BADGE[data.status]}>{STATUS_LABELS[data.status]}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-700">Número conectado</span>
            <span className="text-sm text-ink-900">{data.connectedNumber ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-700">Dispositivo</span>
            <span className="text-sm text-ink-900">{data.deviceName ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-700">Última conexão</span>
            <span className="text-sm text-ink-900" suppressHydrationWarning>
              {data.connectedAt
                ? formatDistanceToNow(new Date(data.connectedAt), { addSuffix: true, locale: ptBR })
                : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-700">Última mensagem recebida</span>
            <span className="text-sm text-ink-900" suppressHydrationWarning>
              {data.lastMessageAt
                ? formatDistanceToNow(new Date(data.lastMessageAt), { addSuffix: true, locale: ptBR })
                : "—"}
            </span>
          </div>
          {data.lastError && <p className="text-xs text-danger">{data.lastError}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex flex-wrap gap-2 pt-2">
            {!isConnected && (
              <Button type="button" onClick={handleGenerateQr} disabled={busyGenerating}>
                {busyGenerating ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                {qr || qrExpired ? "Gerar novo QR Code" : "Gerar QR Code"}
              </Button>
            )}
            {isConnected && (
              <Button type="button" variant="outline" onClick={() => setConfirmMode("disconnect")}>
                <Power size={16} /> Desconectar dispositivo
              </Button>
            )}
            <Button type="button" variant="ghost" className="text-danger" onClick={() => setConfirmMode("delete")}>
              <Trash2 size={16} /> Apagar sessão
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bloco do QR: só aparece depois do clique manual (gerando, QR pronto,
          ou expirado). Nunca aparece só por a sessão estar em awaiting_qr. */}
      {!isConnected && (busyGenerating || qr || qrExpired) && (
        <Card>
          <CardHeader>
            <CardTitle>Escaneie o QR Code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 pt-2">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR Code do WhatsApp" className="h-64 w-64 rounded-xl border border-surface-border" />
            ) : qrExpired ? (
              <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-surface-border text-center">
                <RefreshCw size={24} className="text-ink-400" />
                <p className="max-w-[12rem] text-sm font-medium text-ink-700">QR Code expirado</p>
                <p className="max-w-[12rem] text-xs text-ink-500">Clique em &quot;Gerar novo QR Code&quot; para tentar de novo.</p>
              </div>
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-xl border border-dashed border-surface-border">
                <Loader2 size={24} className="animate-spin text-ink-400" />
              </div>
            )}
            {!qrExpired && (
              <div className="max-w-sm space-y-1 text-center text-sm text-ink-500">
                <p className="flex items-center justify-center gap-1.5 font-medium text-ink-700">
                  <Smartphone size={16} /> WhatsApp Business → Dispositivos conectados → Conectar dispositivo
                </p>
                <p>O código expira em cerca de 1 minuto. Não é renovado automaticamente.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={confirmMode !== null}
        onClose={() => setConfirmMode(null)}
        title={confirmMode === "delete" ? "Apagar sessão do WhatsApp?" : "Desconectar dispositivo?"}
        description={
          confirmMode === "delete"
            ? "Remove as credenciais salvas localmente no Bridge. Será necessário escanear um novo QR Code."
            : "Desvincula o TecNivel CRM do WhatsApp Business no celular. Será necessário um novo QR Code para reconectar."
        }
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmMode(null)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirmMode === "delete" ? handleDeleteSession : handleDisconnect}
            disabled={loadingAction !== null}
          >
            {loadingAction && <Loader2 size={16} className="animate-spin" />}
            Confirmar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
