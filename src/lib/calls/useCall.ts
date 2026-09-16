"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { acceptSignal, type SignalKind, type SignalParty } from "@/lib/calls/signal";

/**
 * One voice call, from the button to the hang-up.
 *
 * ## The shape of the thing
 *
 * Signalling rides Supabase Realtime Broadcast on a channel the server named,
 * and the media rides a plain `RTCPeerConnection`. There is no vendor, no SDK
 * and no new dependency: `@supabase/supabase-js` was already installed with
 * zero `.channel()` calls in the codebase, and every masked-number provider
 * — Twilio, Vonage, Africa's Talking — wants a verified business number and a
 * card, which is the wall `lib/voice/speech.ts` documents this product hitting
 * before.
 *
 * ## The five things that go wrong on a real night, and what each does here
 *
 * **The microphone is refused.** Asked for *before* ringing anybody, so the
 * failure happens while the customer is still looking at a button rather than
 * after a rider has stopped their bike. Ends as `MIC_DENIED`.
 *
 * **Nobody answers.** A twenty-second watchdog, because a phone in a jacket
 * pocket on a motorbike is the normal case rather than the exception. Ends as
 * `TIMEOUT` — a call that rings forever is a customer who thinks it is
 * connecting.
 *
 * **The connection never comes up.** Roughly one mobile connection in five
 * cannot go peer-to-peer at all behind carrier-grade NAT. One automatic retry,
 * relay-only, and then `ICE_FAILED`. Without a TURN provider that retry cannot
 * help and the server says so in `relayCapable` — the screen says "calls may
 * not connect on this network" rather than pretending for twenty seconds.
 *
 * **The tab closes mid-call.** `pagehide` ends it, and the cleanup stops every
 * microphone track. A hook that leaves a track live leaves the recording dot
 * lit on somebody's phone after they think they hung up, which is the single
 * worst thing a voice feature can do.
 *
 * **The same message arrives twice.** `acceptSignal` drops replays and our own
 * echoes; Supabase broadcasts back to the sender by default, and a side that
 * answered its own offer is a deadlock rather than an attack.
 *
 * ## What it refuses to do
 *
 * It never records, never reads the audio, and never sends an SDP or a
 * candidate to our own server — those carry both parties' IP addresses. What
 * goes to `/api/calls/[id]/event` is the ICE state and a round-trip time, and
 * the server's allowlist drops anything else anyway.
 */

export type CallState =
  | "idle"
  | "requesting-mic"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended";

export type CallEndReason =
  | "HANGUP"
  | "DECLINED"
  | "TIMEOUT"
  | "ICE_FAILED"
  | "MIC_DENIED"
  | "UNSUPPORTED"
  | "EXPIRED";

interface Invite {
  callId: string;
  /** Whether the rider's phone actually buzzed. Only set on the callback path. */
  notified?: boolean;
  channel: string;
  secret: string;
  party: SignalParty;
  ringMode: "RING" | "REQUEST_CALLBACK";
  iceServers: RTCIceServer[];
  relayCapable: boolean;
}

/** How long to ring before giving up. A pocket on a motorbike is the norm. */
const RING_TIMEOUT_MS = 20_000;

export interface UseCall {
  state: CallState;
  /** Why it ended, once it has. */
  endReason: CallEndReason | null;
  /** True when the server had no relay to offer — worth saying out loud. */
  relayCapable: boolean;
  /** Set when the rider was notified rather than rung. */
  askedForCallback: boolean;
  /**
   * Whether that notification actually reached a device.
   *
   * Separate from `askedForCallback` on purpose: "we chose not to ring them"
   * and "we told them" are different facts, and v50 shipped a screen that
   * asserted the second while doing neither. `sendPush` returns 0 with no VAPID
   * keys configured, so this is false in production today.
   */
  callbackNotified: boolean;
  /** Seconds since media started flowing. */
  seconds: number;
  start: () => Promise<void>;
  hangUp: (reason?: CallEndReason) => void;
  /** The far side's audio. Attach to an `<audio autoPlay>`. */
  remoteRef: React.RefObject<HTMLAudioElement | null>;
}

export function useCall(orderCode: string): UseCall {
  const [state, setState] = useState<CallState>("idle");
  const [endReason, setEndReason] = useState<CallEndReason | null>(null);
  const [relayCapable, setRelayCapable] = useState(true);
  const [askedForCallback, setAskedForCallback] = useState(false);
  const [callbackNotified, setCallbackNotified] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const remoteRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const inviteRef = useRef<Invite | null>(null);
  const seqRef = useRef(0);
  const seenRef = useRef(0);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /*
    One retry, relay-only, and a latch so it is exactly one. A loop of retries
    on a network that cannot relay is a screen that says "connecting" until the
    customer gives up, which is worse than an honest failure.
  */
  const retriedRef = useRef(false);
  /** Guards every teardown path against running twice. */
  const endedRef = useRef(false);

  /** Stop every track. The recording dot must go out when the call does. */
  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    ringTimer.current = null;
    tickTimer.current = null;
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
    void chanRef.current?.unsubscribe();
    chanRef.current = null;
    releaseMic();
  }, [releaseMic]);

  const send = useCallback((kind: SignalKind, payload?: unknown) => {
    const invite = inviteRef.current;
    const channel = chanRef.current;
    if (!invite || !channel) return;
    seqRef.current += 1;
    void channel.send({
      type: "broadcast",
      event: "signal",
      payload: {
        kind,
        callId: invite.callId,
        secret: invite.secret,
        from: invite.party,
        seq: seqRef.current,
        payload,
      },
    });
  }, []);

  /**
   * Tell our own server what the connection did.
   *
   * Deliberately narrow: the ICE state and a round-trip time. Never a
   * candidate, never an SDP — both carry the IP addresses of the two people on
   * the call, and a log that quietly accumulates those is the thing this
   * feature exists to avoid.
   */
  const report = useCallback(
    (kind: string, detail: Record<string, unknown>, connected = false) => {
      const invite = inviteRef.current;
      if (!invite) return;
      void fetch(`/api/calls/${invite.callId}/event`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderCode, kind, detail, connected }),
        keepalive: true,
      }).catch(() => {});
    },
    [orderCode]
  );

  const finish = useCallback(
    (reason: CallEndReason) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const invite = inviteRef.current;
      send("hangup");
      teardown();
      setState("ended");
      setEndReason(reason);
      if (invite) {
        void fetch(`/api/calls/${invite.callId}/end`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // `keepalive` so a hang-up that happens as the tab closes still
          // lands. Without it the row stays open forever.
          keepalive: true,
          body: JSON.stringify({ orderCode, reason }),
        }).catch(() => {});
      }
    },
    [orderCode, send, teardown]
  );

  const buildPeer = useCallback(
    (invite: Invite, relayOnly: boolean) => {
      const pc = new RTCPeerConnection({
        iceServers: invite.iceServers,
        iceTransportPolicy: relayOnly ? "relay" : "all",
      });

      streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));

      pc.ontrack = (e) => {
        if (remoteRef.current) remoteRef.current.srcObject = e.streams[0];
      };

      pc.onicecandidate = (e) => {
        // Straight to the peer over the signalling channel, never to us.
        if (e.candidate) send("candidate", e.candidate.toJSON());
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") {
          if (ringTimer.current) clearTimeout(ringTimer.current);
          setState("connected");
          report("connected", { iceState: "connected" }, true);
          if (!tickTimer.current) {
            tickTimer.current = setInterval(() => setSeconds((n) => n + 1), 1000);
          }
          return;
        }
        if (s === "failed") {
          report("ice", { iceState: "failed" });
          /*
            One relay-only retry. Where the first attempt failed because the two
            networks could not see each other, forcing the relay usually works —
            and where there is no relay to force, `relayCapable` was already
            false and the screen said so before the call started.
          */
          if (!retriedRef.current && invite.relayCapable) {
            retriedRef.current = true;
            try {
              pcRef.current?.close();
            } catch {
              /* already closed */
            }
            pcRef.current = buildPeer(invite, true);
            void negotiate();
            return;
          }
          finish("ICE_FAILED");
        }
      };

      return pc;
    },
    // `negotiate` is defined below and referenced through the ref, so it is not
    // a dependency here; adding it would make this rebuild on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send, report, finish]
  );

  const negotiateRef = useRef<() => Promise<void>>(async () => {});
  const negotiate = useCallback(() => negotiateRef.current(), []);

  negotiateRef.current = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    send("offer", offer);
  };

  const start = useCallback(async () => {
    if (state !== "idle" && state !== "ended") return;
    endedRef.current = false;
    retriedRef.current = false;
    seqRef.current = 0;
    seenRef.current = 0;
    setEndReason(null);
    setSeconds(0);

    if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("ended");
      setEndReason("UNSUPPORTED");
      return;
    }

    /*
      The microphone first, before anybody is rung.

      A permission prompt that appears *after* a rider has pulled over is the
      worst possible ordering: they have stopped for a call that then does not
      happen. Asking first means the only person inconvenienced by a refusal is
      the person who refused.
    */
    setState("requesting-mic");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("ended");
      setEndReason("MIC_DENIED");
      return;
    }

    const res = await fetch("/api/calls/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderCode }),
    }).catch(() => null);

    if (!res || !res.ok) {
      releaseMic();
      setState("ended");
      setEndReason("EXPIRED");
      return;
    }

    const invite = (await res.json()) as Invite;
    inviteRef.current = invite;
    setRelayCapable(invite.relayCapable);

    /*
      A rider in motion is notified, not rung. There is nothing to connect yet,
      so the microphone is handed straight back — holding it open while waiting
      for a call back would leave the recording indicator lit for minutes.
    */
    if (invite.ringMode === "REQUEST_CALLBACK") {
      releaseMic();
      setAskedForCallback(true);
      setCallbackNotified(invite.notified === true);
      setState("ended");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(invite.channel, { config: { broadcast: { self: false } } });
    chanRef.current = channel;

    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const msg = acceptSignal(payload, {
        callId: invite.callId,
        secret: invite.secret,
        self: invite.party,
        seen: seenRef.current,
      });
      if (!msg) return;
      seenRef.current = msg.seq;

      const pc = pcRef.current;
      if (!pc) return;

      if (msg.kind === "sdp-answer") {
        await pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
        setState("connecting");
      } else if (msg.kind === "offer") {
        await pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send("sdp-answer", answer);
      } else if (msg.kind === "candidate") {
        try {
          await pc.addIceCandidate(msg.payload as RTCIceCandidateInit);
        } catch {
          // A candidate that arrives before the remote description, or one the
          // browser dislikes. Dropping it is correct; there will be others.
        }
      } else if (msg.kind === "decline") {
        finish("DECLINED");
      } else if (msg.kind === "hangup") {
        finish("HANGUP");
      }
    });

    await channel.subscribe();

    pcRef.current = buildPeer(invite, false);
    setState("ringing");
    send("ring");
    await negotiate();

    ringTimer.current = setTimeout(() => finish("TIMEOUT"), RING_TIMEOUT_MS);
  }, [state, orderCode, buildPeer, finish, negotiate, releaseMic, send]);

  const hangUp = useCallback((reason: CallEndReason = "HANGUP") => finish(reason), [finish]);

  // The tab closing is a hang-up. Without this the row stays open and, worse,
  // the microphone track outlives the page on some browsers.
  useEffect(() => {
    const onHide = () => finish("HANGUP");
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [finish]);

  // Unmount is not a hang-up the peer needs told about — but it absolutely is a
  // microphone that must be released.
  useEffect(() => () => teardown(), [teardown]);

  return {
    state,
    endReason,
    relayCapable,
    askedForCallback,
    callbackNotified,
    seconds,
    start,
    hangUp,
    remoteRef,
  };
}
