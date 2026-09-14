"use client";

import { useEffect, useRef, useState } from "react";
import { listenWhileRecording } from "@/lib/voice/speech";
import { Mic, Square, Trash2, Loader2, Check, ShieldCheck } from "lucide-react";
import { uploadFile } from "@/lib/uploads/client";
import { cn } from "@/lib/utils";

/**
 * Ordering by voice note.
 *
 * In this market a voice note is how people actually communicate, and it
 * collapses a twenty-field form into ten seconds. That is the bet — but it is
 * only a bet, so the whole feature sits behind `voiceOrderingEnabled` in
 * settings and ships switched OFF. The owner turns it on when the market says
 * so, with no deploy.
 *
 * The recording goes to a PRIVATE bucket. A voice note carries a real person's
 * voice, their address and often their name, so it is never public, never in a
 * shared PDF, and readable only by staff through the gated media route.
 */

const MAX_SECONDS = 90;

/**
 * The bare MIME type, without the codec parameters the recorder appends.
 *
 * Chrome on Android reports `audio/webm;codecs=opus`. Sent verbatim as a
 * Content-Type it does not match the bucket's `audio/webm` entry and storage
 * rejects the upload — so every recording on the most common phone here failed
 * while the recording itself looked fine.
 */
function baseMime(mimeType: string): string {
  return (mimeType.split(";")[0] || "").trim().toLowerCase() || "audio/webm";
}

/** The file extension storage and a desktop player will both understand. */
function extensionFor(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export function VoiceNoteField({
  accent,
  fr,
  onChange,
}: {
  accent: string;
  fr: boolean;
  /**
   * Receives the stored path, the length, and whatever the browser managed to
   * hear, or nulls when the note is removed. The transcript is best-effort: an
   * unsupported browser or a denied permission simply sends an empty string,
   * and the order behaves exactly as it did before any of this existed.
   */
  onChange: (note: { url: string; seconds: number; transcript: string } | null) => void;
}) {
  // The switch is checked here rather than by each caller, so a form can never
  // accidentally show the microphone while the feature is off.
  const [enabled, setEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savedSeconds, setSavedSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  /*
   * The browser's own speech recogniser, running alongside the recorder.
   *
   * This is the route that cannot be blocked: no key, no account, no card and
   * no signup flow that can refuse a Cameroonian number. It listens to the same
   * microphone we already opened, so the words are ready the moment the
   * customer stops speaking.
   */
  const heardRef = useRef<{ text: () => string; stop: () => void } | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setEnabled(d.voiceOrderingEnabled === true))
      .catch(() => setEnabled(false));
  }, []);

  // A live microphone must not survive the component. Leaving the track open
  // keeps the phone's recording indicator lit, which reads as spyware.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function start() {
    setError(null);

    // Two different failures that used to look identical: a browser that
    // cannot record at all, and one that can but was refused the microphone.
    // Telling somebody to grant permission they were never asked for is worse
    // than saying nothing.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext === false
          ? fr
            ? "L'enregistrement nécessite une connexion sécurisée (https)."
            : "Recording needs a secure (https) connection."
          : fr
            ? "Ce navigateur ne permet pas l'enregistrement. Remplissez le formulaire."
            : "This browser can't record. Please fill in the form instead."
      );
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError(
        fr
          ? "Ce navigateur ne permet pas l'enregistrement. Remplissez le formulaire."
          : "This browser can't record. Please fill in the form instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setPreviewUrl(URL.createObjectURL(blob));
        // Read before the listener is discarded, so a late final segment is
        // still counted.
        const transcript = heardRef.current?.text() ?? "";
        void upload(blob, recorder.mimeType || "audio/webm", transcript);
      };
      recorder.start();
      recorderRef.current = recorder;
      // Best-effort, and never allowed to interfere: if this browser has no
      // recogniser, or it throws, `listenWhileRecording` returns something inert
      // and the recording carries on untouched.
      heardRef.current = listenWhileRecording(fr);
      setRecording(true);
      setSeconds(0);
      tickRef.current = setInterval(() => {
        setSeconds((s) => {
          // Stop ourselves rather than letting somebody upload ten minutes.
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError(
        fr
          ? "Autorisez le micro pour enregistrer, ou remplissez le formulaire."
          : "Allow the microphone to record, or just fill in the form."
      );
    }
  }

  function stop() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setRecording(false);
    // Stopped before the recorder, so the recogniser has settled its last
    // segment by the time `onstop` reads the text.
    heardRef.current?.stop();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function upload(blob: Blob, mime: string, transcript = "") {
    setUploading(true);
    try {
      // Storage matches the Content-Type exactly, so the codec parameters have
      // to come off before the file is built — `file.type` is what becomes the
      // upload header.
      const type = baseMime(mime);
      const file = new File([blob], `note.${extensionFor(type)}`, { type });
      const path = await uploadFile(file, "order-voice-notes", "voice");
      setSavedSeconds(seconds);
      onChange({ url: path, seconds, transcript });
    } catch {
      setError(fr ? "L'envoi a échoué. Réessayez." : "That didn't upload. Try again.");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSavedSeconds(null);
    setSeconds(0);
    heardRef.current = null;
    onChange(null);
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!enabled) return null;

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
        <Mic className="h-3.5 w-3.5" style={{ color: accent }} />
        {fr ? "Ou envoyez une note vocale" : "Or just tell us in a voice note"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-mist-500">
        {fr
          ? "Dites ce qu'il vous faut et où vous êtes. Notre dispatcher écoute et vous rappelle le prix."
          : "Say what you need and where you are. Dispatch listens and comes back with the price. Faster than typing."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!previewUrl && !recording && (
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-950"
            style={{ backgroundColor: accent }}
          >
            <Mic className="h-4 w-4" /> {fr ? "Enregistrer" : "Record"}
          </button>
        )}

        {recording && (
          <>
            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-1.5 rounded-xl bg-restricted px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Square className="h-4 w-4" /> {fr ? "Arrêter" : "Stop"}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-mist-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-restricted" />
              {mmss(seconds)} / {mmss(MAX_SECONDS)}
            </span>
          </>
        )}

        {uploading && (
          <span className="flex items-center gap-1.5 text-sm text-mist-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {fr ? "Envoi…" : "Sending…"}
          </span>
        )}

        {previewUrl && !uploading && (
          <>
            <audio controls src={previewUrl} className="h-9 max-w-full" />
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1 text-xs text-mist-500 hover:text-restricted"
            >
              <Trash2 className="h-3.5 w-3.5" /> {fr ? "Supprimer" : "Remove"}
            </button>
          </>
        )}
      </div>

      {savedSeconds != null && !uploading && (
        <p className={cn("mt-2 flex items-center gap-1.5 text-xs text-safe")}>
          <Check className="h-3.5 w-3.5" />
          {fr ? `Note de ${mmss(savedSeconds)} attachée.` : `${mmss(savedSeconds)} note attached to your order.`}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}

      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-mist-500">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-safe" />
        {fr
          ? "Votre note reste privée : seule notre équipe l'écoute, elle n'est jamais publiée ni jointe à un PDF partagé."
          : "Your note stays private — only our team hears it. It is never published and never attached to a shared PDF."}
      </p>
    </div>
  );
}
