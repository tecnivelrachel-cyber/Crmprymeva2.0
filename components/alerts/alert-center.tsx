"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Volume2, VolumeX, X, AlertTriangle } from "lucide-react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { decideAlert, buildNotificationPayload } from "@/lib/alerts/rules";
import { electLeader, prunePeers, type PeerRecord } from "@/lib/alerts/tab-leader";
import { subscribeToPush, urlBase64ToArrayBuffer, type PushSubscribeResult } from "@/lib/alerts/push-subscribe";
import { SOUND_PREFERENCE_KEY, ALERTS_ENABLED_KEY, parseSoundPreference, parseAlertsEnabled } from "@/lib/alerts/preferences";
import { subscribeToPushAction } from "@/app/(crm)/notificacoes/push-actions";

const LEADER_CHANNEL = "prymeva-alert-leader";
const LEADER_HEARTBEAT_MS = 2000;

/** Bipe curto e suave via Web Audio — sem arquivo externo, sem som estridente. */
function playChime(context: AudioContext) {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  gain.connect(context.destination);

  for (const [frequency, offset] of [
    [880, 0],
    [1108.73, 0.09],
  ] as const) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + offset);
    oscillator.connect(gain);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.4);
  }
}

/**
 * Som e notificação do navegador para mensagens RECEBIDAS.
 *
 * Ordem de ativação importa: o áudio é desbloqueado e o estado é gravado
 * ANTES de qualquer coisa que dependa de rede ou do service worker. A versão
 * anterior fazia `await` na assinatura de push no meio do fluxo, e
 * `navigator.serviceWorker.ready` nunca rejeita — quando nenhum service
 * worker ativava, a promise ficava pendente para sempre e as linhas
 * seguintes (que habilitavam o som) jamais rodavam. Falha silenciosa: nem
 * erro, nem som, nem push.
 */
export function AlertCenter() {
  const router = useRouter();
  const realtime = useRealtime();

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [isLeader, setIsLeader] = useState(true);
  const [pushStatus, setPushStatus] = useState<PushSubscribeResult | null>(null);
  const [activating, setActivating] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  // Verdade sobre o áudio NESTA carga de página — não a preferência salva.
  const [audioReady, setAudioReady] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);

  /**
   * Cria/retoma o AudioContext e toca o bipe de teste. Só devolve true se o
   * contexto ficou de fato em "running" — é essa confirmação, e não a
   * preferência salva, que autoriza mostrar o som como ativado.
   */
  const unlockAudio = useCallback(async (): Promise<boolean> => {
    try {
      const AudioCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return false;

      const context = audioContextRef.current ?? new AudioCtor();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();
      if (context.state !== "running") return false;

      setAudioReady(true);
      playChime(context);
      return true;
    } catch {
      return false;
    }
  }, []);
  const alertedRef = useRef(new Set<string>());
  const sessionStartedAt = useRef(Date.now());
  const tabId = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    setAlertsEnabled(parseAlertsEnabled(window.localStorage.getItem(ALERTS_ENABLED_KEY)));
    setSoundEnabled(parseSoundPreference(window.localStorage.getItem(SOUND_PREFERENCE_KEY)));
    setDismissed(window.localStorage.getItem(ALERTS_ENABLED_KEY) !== null);
  }, []);

  /**
   * O AudioContext NÃO sobrevive a um reload. Depois de recarregar a página,
   * `alertsEnabled`/`soundEnabled` voltavam true do localStorage mas o
   * contexto era null — o ícone mostrava som ativado e nenhuma mensagem
   * tocava, até o usuário clicar no ícone (que recriava o contexto e dava a
   * impressão de que "o bipe funciona, o automático não").
   *
   * O navegador exige um gesto do usuário, mas serve QUALQUER gesto na
   * página. Então rearmamos o áudio no primeiro clique/tecla, sem pedir nada
   * a ele — e sem tocar bipe nenhum, para não assustar.
   */
  useEffect(() => {
    if (!alertsEnabled || audioReady) return;

    let cancelled = false;
    async function rearm() {
      if (cancelled) return;
      try {
        const AudioCtor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        const context = audioContextRef.current ?? new AudioCtor();
        audioContextRef.current = context;
        if (context.state === "suspended") await context.resume();
        if (!cancelled && context.state === "running") setAudioReady(true);
      } catch {
        // Silencioso: o usuário ainda pode reativar pelo ícone.
      }
    }

    // Alguns navegadores já permitem retomar sem gesto quando a permissão
    // veio de uma visita anterior — tentamos, e se não der, esperamos o gesto.
    void rearm();

    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((event) => document.addEventListener(event, rearm, { once: true, passive: true }));
    return () => {
      cancelled = true;
      events.forEach((event) => document.removeEventListener(event, rearm));
    };
  }, [alertsEnabled, audioReady]);

  // Eleição de aba líder. Começa como líder (caso de uma aba só) e só abre
  // mão se outra aba com id menor se anunciar — assim uma aba sozinha nunca
  // fica esperando resposta de ninguém para poder alertar.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(LEADER_CHANNEL);
    const me = tabId.current;
    let peers: PeerRecord[] = [];

    function recompute() {
      const now = Date.now();
      peers = prunePeers(peers, now);
      setIsLeader(electLeader(me, peers, now));
    }

    channel.onmessage = (event: MessageEvent<{ tabId?: string }>) => {
      const peerId = event.data?.tabId;
      if (!peerId || peerId === me) return;
      const existing = peers.find((p) => p.id === peerId);
      if (existing) existing.lastSeenAt = Date.now();
      else peers.push({ id: peerId, lastSeenAt: Date.now() });
      recompute();
    };

    channel.postMessage({ tabId: me });
    recompute();
    const heartbeat = setInterval(() => {
      channel.postMessage({ tabId: me });
      recompute();
    }, LEADER_HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
      channel.close();
    };
  }, []);

  const enableAlerts = useCallback(async () => {
    setActivating(true);
    try {
      // 1. Áudio primeiro, dentro do gesto do usuário, e com som de teste
      //    imediato — é a confirmação de que o navegador desbloqueou mesmo.
      const unlocked = await unlockAudio();
      setAudioError(unlocked ? null : "O navegador bloqueou o som. Clique no ícone de som para tentar de novo.");
      setSoundEnabled(unlocked);

      // 2. Estado gravado ANTES de qualquer rede/service worker. Se o push
      //    falhar depois, o som continua funcionando.
      window.localStorage.setItem(ALERTS_ENABLED_KEY, "true");
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(unlocked));
      setAlertsEnabled(true);
      setDismissed(true);

      // 3. Permissão de notificação — só a partir deste clique.
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          // Usuário fechou o pedido — respeitamos e não insistimos.
        }
      }

      // 4. Push por último, com prazo máximo e resultado visível.
      const result = await subscribeToPush({
        supported: typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window,
        permission: typeof Notification !== "undefined" ? Notification.permission : "denied",
        vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        waitForServiceWorker: () => navigator.serviceWorker.ready,
        getOrCreateSubscription: async () => {
          const registration = await navigator.serviceWorker.ready;
          const existing = await registration.pushManager.getSubscription();
          const subscription =
            existing ??
            (await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToArrayBuffer(
                process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
                window.atob.bind(window)
              ),
            }));
          const json = subscription.toJSON();
          if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
          return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
        },
        save: async (keys) => {
          const response = await subscribeToPushAction({ ...keys, userAgent: navigator.userAgent.slice(0, 200) });
          return "error" in response ? { ok: false, error: response.error } : { ok: true };
        },
      });

      setPushStatus(result);
    } finally {
      setActivating(false);
    }
  }, []);

  /**
   * Religar o som precisa DESBLOQUEAR o áudio de verdade, não só gravar a
   * preferência. Antes, o ícone passava a dizer "ativado" enquanto o
   * AudioContext seguia suspenso (ou nem existia) e nenhum bipe tocava —
   * o estado visual mentia sobre o estado real.
   */
  const toggleSound = useCallback(async () => {
    if (soundEnabled) {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, "false");
      setSoundEnabled(false);
      return;
    }

    const unlocked = await unlockAudio();
    if (!unlocked) {
      setAudioError("Não foi possível ativar o som neste navegador. Clique de novo para tentar.");
      setSoundEnabled(false);
      return;
    }
    setAudioError(null);
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, "true");
    setSoundEnabled(true);
  }, [soundEnabled]);

  useEffect(() => {
    if (!realtime) return;

    return realtime.onMessage((message, event) => {
      if (event !== "INSERT") return;

      const decision = decideAlert(
        message,
        {
          soundEnabled: soundEnabled && alertsEnabled,
          audioUnlocked: audioContextRef.current?.state === "running",
          alreadyAlerted: alertedRef.current,
          isLeaderTab: isLeader,
          sessionStartedAt: sessionStartedAt.current,
        },
        document.visibilityState === "hidden"
      );

      if (!decision.playSound && !decision.showNotification) return;
      alertedRef.current.add(message.id);

      if (decision.playSound && audioContextRef.current) {
        try {
          playChime(audioContextRef.current);
        } catch {
          // Falha de áudio nunca deve derrubar a interface.
        }
      }

      if (decision.showNotification && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const payload = buildNotificationPayload(message, null);
        try {
          const notification = new Notification(payload.title, {
            body: payload.body,
            tag: payload.tag,
            icon: "/icons/icon-192.png",
          });
          notification.onclick = () => {
            window.focus();
            router.push(`/conversas?id=${payload.conversationId}`);
            notification.close();
          };
        } catch {
          // Alguns navegadores exigem o service worker para notificar; ignoramos.
        }
      }
    });
  }, [realtime, soundEnabled, alertsEnabled, isLeader, router]);

  if (!dismissed) {
    return (
      <div className="animate-fade-in fixed bottom-4 left-1/2 z-50 flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-surface-border bg-white p-3 shadow-card">
        <Bell size={18} className="shrink-0 text-navy-700" />
        <p className="min-w-0 flex-1 text-xs text-ink-700">
          Ative o aviso sonoro e as notificações para saber na hora quando um cliente responder.
        </p>
        <button
          type="button"
          onClick={enableAlerts}
          disabled={activating}
          className="press shrink-0 rounded-lg bg-navy-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          {activating ? "Ativando..." : "Ativar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            window.localStorage.setItem(ALERTS_ENABLED_KEY, "false");
          }}
          aria-label="Agora não"
          className="shrink-0 rounded-lg p-1 text-ink-400 hover:text-ink-700"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!alertsEnabled) {
    return (
      <button
        type="button"
        onClick={enableAlerts}
        disabled={activating}
        title="Ativar som e notificações de novas mensagens"
        aria-label="Ativar som e notificações"
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-surface-muted hover:text-navy-700 disabled:opacity-60"
      >
        <BellOff size={18} />
      </button>
    );
  }

  // Três recursos distintos, três estados distintos — um ícone só de
  // "ativado" escondia que o push tinha falhado e que o som nem tocava.
  // Só "funcionando" quando o áudio está REALMENTE rodando nesta carga de
  // página. Antes bastava a preferência salva, e o ícone ficava azul depois
  // de um reload mesmo sem AudioContext — nenhuma mensagem tocava.
  const soundWorking = soundEnabled && audioReady && !audioError;
  const notificationGranted = typeof Notification !== "undefined" && Notification.permission === "granted";
  const pushSubscribed = pushStatus?.status === "subscribed";
  const pushFailed = pushStatus !== null && !pushSubscribed;

  const soundTitle = audioError
    ? audioError
    : !soundEnabled
      ? "Som de novas mensagens silenciado (clique para ativar)"
      : soundWorking
        ? "Som de novas mensagens ativado"
        : "Som aguardando liberação do navegador — clique em qualquer lugar da página";

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={toggleSound}
        title={soundTitle}
        aria-label={soundWorking ? "Silenciar som de novas mensagens" : "Ativar som de novas mensagens"}
        aria-pressed={soundWorking}
        className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-muted ${
          audioError ? "text-warning" : soundWorking ? "text-navy-700" : "text-ink-400"
        }`}
      >
        {soundWorking ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>

      {(pushFailed || !notificationGranted) && (
        <button
          type="button"
          onClick={enableAlerts}
          disabled={activating}
          title={
            !notificationGranted
              ? "Notificações do navegador não autorizadas. Clique para autorizar."
              : `Notificações com o navegador fechado indisponíveis: ${
                  pushStatus && pushStatus.status !== "subscribed" ? pushStatus.message : ""
                } Clique para tentar de novo.`
          }
          aria-label="Notificações indisponíveis — tentar novamente"
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-warning hover:bg-surface-muted disabled:opacity-60"
        >
          <AlertTriangle size={16} />
        </button>
      )}
    </div>
  );
}
