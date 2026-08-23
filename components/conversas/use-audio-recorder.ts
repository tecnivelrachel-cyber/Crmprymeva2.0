"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Formatos que o navegador pode gravar E que o detector do servidor aceita
 * (media-detect valida os bytes: WebM só passa se for áudio puro, MP4 só se
 * tiver apenas track de som). Ordem = preferência.
 */
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(mimeType: string): string {
  return mimeType.startsWith("audio/mp4") ? "m4a" : "webm";
}

export type RecorderStatus = "idle" | "recording" | "processing";

export interface AudioRecorder {
  status: RecorderStatus;
  seconds: number;
  error: string | null;
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

/**
 * Grava áudio pelo microfone e devolve o arquivo pronto via `onFinish`.
 * O microfone é sempre liberado ao parar, cancelar ou desmontar — nunca fica
 * um indicador de gravação aceso depois que o usuário sai da tela.
 */
export function useAudioRecorder(onFinish: (file: File) => void): AudioRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!pickMimeType());
  }, []);

  const releaseMic = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Libera o microfone se o componente sair da tela durante a gravação.
  useEffect(() => releaseMic, [releaseMic]);

  const start = useCallback(async () => {
    setError(null);
    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("Seu navegador não permite gravar áudio.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
      return;
    }

    cancelledRef.current = false;
    chunksRef.current = [];
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const wasCancelled = cancelledRef.current;
      const collected = chunksRef.current;
      releaseMic();

      if (wasCancelled || collected.length === 0) {
        setStatus("idle");
        setSeconds(0);
        return;
      }

      const blob = new Blob(collected, { type: mimeType });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const file = new File([blob], `audio-${stamp}.${extensionFor(mimeType)}`, { type: mimeType });

      setStatus("idle");
      setSeconds(0);
      onFinishRef.current(file);
    };

    recorder.start();
    setStatus("recording");
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, [releaseMic]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state !== "recording") return;
    cancelledRef.current = false;
    setStatus("processing");
    recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    if (recorderRef.current?.state !== "recording") {
      releaseMic();
      setStatus("idle");
      setSeconds(0);
      return;
    }
    cancelledRef.current = true;
    recorderRef.current.stop();
  }, [releaseMic]);

  return { status, seconds, error, supported, start, stop, cancel };
}

/** mm:ss para o cronômetro da gravação. */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
