import { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, Linking, Alert, TextInput,
} from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { api } from "../api";
import { startTracking, stopTracking } from "../tracking";
import { c, formatXaf } from "../theme";

/**
 * The job, in the order a rider actually does it.
 *
 * One primary action visible at a time. A rider reads this at a junction with
 * one hand and a helmet on, so a screen offering six equal choices is a screen
 * that gets the wrong one tapped.
 *
 * Tracking starts when they accept and stops at delivery, without anyone having
 * to remember a toggle. On the website riders kept forgetting it, and an order
 * with no positions looks to the customer exactly like a service that has
 * stopped working.
 */

interface JobDetail {
  id: string;
  orderCode: string;
  status: string;
  customerName: string;
  customerWhatsapp: string;
  pickup: { text: string; landmark: string | null; lat: number | null; lng: number | null };
  delivery: { text: string; landmark: string | null; lat: number | null; lng: number | null };
  itemDescription: string;
  quantity: number;
  specialInstructions: string | null;
  merchantName: string | null;
  merchantPhone: string | null;
  safetyNotes: string | null;
  acceptedAt: string | null;
  offeredAt: string | null;
  payoutXaf: number | null;
  payoutIsEstimate: boolean;
  shopping: {
    isShopping: boolean;
    capXaf: number | null;
    actualXaf: number | null;
    totalXaf: number;
    totalIsCeiling: boolean;
  };
}

/** The next step, and nothing else. Mirrors the web app's step order exactly. */
const NEXT: Record<string, { status: string; label: string }> = {
  RIDER_ASSIGNED: { status: "RIDER_GOING_TO_PICKUP", label: "I'm on my way to collect" },
  RIDER_GOING_TO_PICKUP: { status: "RIDER_ARRIVED_AT_PICKUP", label: "I've arrived to collect" },
  RIDER_ARRIVED_AT_PICKUP: { status: "ITEM_COLLECTED", label: "I have the order" },
  ITEM_COLLECTED: { status: "RIDER_GOING_TO_DELIVERY", label: "I'm on my way to the customer" },
  RIDER_GOING_TO_DELIVERY: { status: "RIDER_ARRIVED_AT_DELIVERY", label: "I've arrived" },
};

export function JobScreen({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  // The screen stays lit while a rider is working a job. Background tracking
  // covers the pocket; this covers the phone sitting on a handlebar mount.
  useKeepAwake();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");

  const load = useCallback(async () => {
    const res = await api.job(jobId);
    if (res.data) setJob((res.data as { job: JobDetail }).job);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  // Accepted and not yet delivered means tracking should be running, whatever
  // happened in between — an app killed by the OS and reopened must resume,
  // not quietly leave the customer watching a frozen map.
  useEffect(() => {
    if (!job) return;
    const finished = ["DELIVERED", "CLOSED", "FAILED_DELIVERY", "CANCELLED_BY_UNL", "CANCELLED_BY_CUSTOMER"];
    if (job.acceptedAt && !finished.includes(job.status)) {
      startTracking(job.id).then((r) => {
        if (r.problem === "denied-background") {
          Alert.alert(
            "Keep the app open",
            "Without background location we can only see you while this screen is up. Allow location 'all the time' in Settings and your customer keeps seeing you with the phone in your pocket."
          );
        } else if (r.problem === "services-off") {
          Alert.alert("Turn on location", "Your phone's location is off, so nobody can see you coming.");
        }
      });
    } else if (finished.includes(job.status)) {
      stopTracking();
    }
  }, [job]);

  async function answer(accept: boolean) {
    setBusy(true);
    const res = await api.answerAssignment(jobId, accept, accept ? undefined : "Declined in app");
    setBusy(false);
    if (!res.ok) return Alert.alert("Couldn't send that", "Check your connection and try again.");
    if (accept) load();
    else onBack();
  }

  async function advance(status: string) {
    setBusy(true);
    const res = await api.setStatus(jobId, status);
    setBusy(false);
    if (!res.ok) return Alert.alert("Couldn't send that", "Check your connection and try again.");
    load();
  }

  async function confirmDelivery() {
    setBusy(true);
    const res = await api.submitProof(jobId, "DELIVERY", { otpCode: otp.trim() });
    setBusy(false);
    if (!res.ok) return Alert.alert("That code doesn't match", "Ask the customer to read it again.");
    setOtp("");
    await stopTracking();
    load();
  }

  function navigate(to: { text: string; lat: number | null; lng: number | null }) {
    const destination = to.lat != null && to.lng != null ? `${to.lat},${to.lng}` : `${to.text}, Yaoundé`;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`
    );
  }

  if (!job) {
    return (
      <View style={s.wrap}>
        <Text style={s.loading}>Loading…</Text>
      </View>
    );
  }

  const needsAnswer = job.offeredAt != null && job.acceptedAt == null;
  const step = NEXT[job.status];
  const atDoor = job.status === "RIDER_ARRIVED_AT_DELIVERY";

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.content}>
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={s.back}>‹ Tonight</Text>
      </Pressable>

      <Text style={s.code}>{job.orderCode}</Text>
      {job.payoutXaf != null && (
        <Text style={s.payout}>
          You earn {formatXaf(job.payoutXaf)}
          {job.payoutIsEstimate ? " (estimated)" : ""}
        </Text>
      )}

      {job.safetyNotes && <Text style={s.safety}>⚠ {job.safetyNotes}</Text>}

      {needsAnswer ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>Dispatch is waiting on you</Text>
          <Pressable style={s.primary} disabled={busy} onPress={() => answer(true)}>
            <Text style={s.primaryText}>Accept this delivery</Text>
          </Pressable>
          <Pressable style={s.secondary} disabled={busy} onPress={() => answer(false)}>
            <Text style={s.secondaryText}>I can&apos;t take it</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={s.card}>
        <Text style={s.label}>Collect from</Text>
        <Text style={s.value}>{job.merchantName ?? job.pickup.text}</Text>
        {job.pickup.landmark ? <Text style={s.hint}>{job.pickup.landmark}</Text> : null}
        <Pressable style={s.nav} onPress={() => navigate(job.pickup)}>
          <Text style={s.navText}>Navigate to pickup</Text>
        </Pressable>
        {job.merchantPhone ? (
          <Pressable onPress={() => Linking.openURL(`tel:${job.merchantPhone}`)}>
            <Text style={s.link}>Call the shop</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.card}>
        <Text style={s.label}>Deliver to</Text>
        <Text style={s.value}>{job.delivery.text}</Text>
        {job.delivery.landmark ? <Text style={s.hint}>{job.delivery.landmark}</Text> : null}
        <Pressable style={s.nav} onPress={() => navigate(job.delivery)}>
          <Text style={s.navText}>Navigate to customer</Text>
        </Pressable>
        {job.acceptedAt ? (
          <Pressable onPress={() => Linking.openURL(`https://wa.me/${job.customerWhatsapp.replace(/\D/g, "")}`)}>
            <Text style={s.link}>Message {job.customerName}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.card}>
        <Text style={s.label}>What you&apos;re carrying</Text>
        <Text style={s.value}>
          {job.itemDescription} × {job.quantity}
        </Text>
        {job.specialInstructions ? <Text style={s.hint}>{job.specialInstructions}</Text> : null}
        {job.shopping.isShopping && (
          <Text style={s.money}>
            {job.shopping.actualXaf != null
              ? `Shop charged ${formatXaf(job.shopping.actualXaf)} · collect ${formatXaf(job.shopping.totalXaf)}`
              : `Spend up to ${formatXaf(job.shopping.capXaf ?? 0)} — photograph the receipt before you leave the counter`}
          </Text>
        )}
      </View>

      {step && !needsAnswer ? (
        <Pressable style={s.primary} disabled={busy} onPress={() => advance(step.status)}>
          <Text style={s.primaryText}>{step.label}</Text>
        </Pressable>
      ) : null}

      {atDoor && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Hand the order over first</Text>
          <Text style={s.hint}>
            Give them what they ordered, then ask for their 4-digit code. The code proves they
            received it — it is not a condition of getting it.
          </Text>
          <TextInput
            style={s.otp}
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            placeholder="0000"
            placeholderTextColor={c.mist500}
            maxLength={6}
          />
          <Pressable
            style={[s.primary, otp.length < 4 && s.off]}
            disabled={busy || otp.length < 4}
            onPress={confirmDelivery}
          >
            <Text style={s.primaryText}>Confirm delivery</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.ink950 },
  content: { padding: 16, paddingBottom: 48 },
  loading: { color: c.mist500, textAlign: "center", marginTop: 64 },
  back: { color: c.mist400, fontSize: 15, marginBottom: 12 },
  code: { color: c.gold, fontSize: 26, fontWeight: "700" },
  payout: { color: c.mist300, fontSize: 14, marginTop: 4, marginBottom: 12 },
  safety: {
    color: c.caution, fontSize: 13, lineHeight: 19, borderColor: c.caution,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12,
  },
  card: {
    backgroundColor: c.ink900, borderColor: c.ink700, borderWidth: 1,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  cardTitle: { color: c.mist100, fontSize: 16, fontWeight: "700", marginBottom: 8 },
  label: { color: c.mist500, fontSize: 12 },
  value: { color: c.mist100, fontSize: 16, fontWeight: "600", marginTop: 4 },
  hint: { color: c.mist500, fontSize: 13, lineHeight: 19, marginTop: 4 },
  money: { color: c.gold, fontSize: 13, lineHeight: 19, marginTop: 10 },
  link: { color: c.violet300, fontSize: 14, marginTop: 12 },
  nav: {
    borderColor: c.violet, borderWidth: 1, borderRadius: 12,
    paddingVertical: 10, alignItems: "center", marginTop: 12,
  },
  navText: { color: c.violet300, fontSize: 14, fontWeight: "600" },
  primary: {
    backgroundColor: c.gold, borderRadius: 16, paddingVertical: 18,
    alignItems: "center", marginTop: 8,
  },
  primaryText: { color: c.ink950, fontSize: 16, fontWeight: "700" },
  secondary: {
    borderColor: c.ink700, borderWidth: 1, borderRadius: 16,
    paddingVertical: 14, alignItems: "center", marginTop: 8,
  },
  secondaryText: { color: c.mist300, fontSize: 15 },
  off: { opacity: 0.4 },
  otp: {
    backgroundColor: c.ink950, borderColor: c.ink700, borderWidth: 1, borderRadius: 12,
    paddingVertical: 14, color: c.mist100, fontSize: 28, textAlign: "center",
    letterSpacing: 12, marginTop: 12,
  },
});
