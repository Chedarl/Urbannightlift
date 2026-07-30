import { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, Switch,
} from "react-native";
import { api, type Job, type RiderMe } from "../api";
import { c, formatXaf } from "../theme";

/**
 * Tonight: am I working, what have I earned, what can I spend, what's next.
 *
 * Ordered the way a rider actually needs it at 8 PM. The float figure is third
 * rather than buried, because a rider who reaches a counter and discovers they
 * cannot pay has already wasted the trip — and the company's money is the one
 * number the website used to hide from them entirely.
 */
export function Tonight({
  onOpenJob,
  onSignOut,
}: {
  onOpenJob: (id: string) => void;
  onSignOut: () => void;
}) {
  const [me, setMe] = useState<RiderMe | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const [meRes, jobsRes] = await Promise.all([api.me(), api.jobs()]);
    // A failed refresh keeps the last screen rather than blanking it. A rider
    // riding through a dead patch should still be able to read the address they
    // are going to.
    setOffline(!meRes.ok || !jobsRes.ok);
    if (meRes.data) setMe(meRes.data);
    if (jobsRes.data) setJobs(jobsRes.data.jobs);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function toggleOnline(next: boolean) {
    setMe((prev) => (prev ? { ...prev, rider: { ...prev.rider, isOnline: next } } : prev));
    const res = await api.setOnline(next);
    if (!res.ok) load();
  }

  const noFloat = me != null && me.float.limitXaf <= 0;

  return (
    <ScrollView
      style={s.wrap}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={c.mist400}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={s.headerRow}>
        <Text style={s.title}>Tonight</Text>
        <Pressable onPress={onSignOut} hitSlop={12}>
          <Text style={s.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {offline && (
        <Text style={s.offline}>
          No connection — showing what we last had. It will catch up by itself.
        </Text>
      )}

      <View style={s.card}>
        <View style={s.rowBetween}>
          <View>
            <Text style={s.cardLabel}>{me?.rider.isOnline ? "You're online" : "You're offline"}</Text>
            <Text style={s.cardHint}>
              {me?.rider.isOnline ? "Dispatch can send you work." : "Dispatch will skip you."}
            </Text>
          </View>
          <Switch
            value={me?.rider.isOnline ?? false}
            onValueChange={toggleOnline}
            trackColor={{ true: c.safe, false: c.ink700 }}
            thumbColor={c.mist100}
          />
        </View>
      </View>

      <View style={[s.card, s.gold]}>
        <Text style={s.cardLabel}>Earned tonight</Text>
        <Text style={s.big}>{formatXaf(me?.tonight.earnedXaf ?? 0)}</Text>
      </View>

      <View style={[s.card, noFloat && s.caution]}>
        <Text style={s.cardLabel}>Company float</Text>
        {noFloat ? (
          <Text style={s.cautionText}>
            You have none. You can&apos;t take food, pharmacy or grocery jobs until dispatch gives
            you one — and never buy with your own money.
          </Text>
        ) : (
          <>
            <Text style={s.big}>{formatXaf(me?.float.spendableXaf ?? 0)}</Text>
            <Text style={s.cardHint}>left to spend at a counter</Text>
          </>
        )}
      </View>

      <Text style={s.section}>Your jobs</Text>
      {jobs.length === 0 ? (
        <Text style={s.empty}>Nothing yet tonight.</Text>
      ) : (
        jobs.map((j) => {
          const needsAnswer = j.offeredAt != null && j.acceptedAt == null;
          return (
            <Pressable
              key={j.id}
              onPress={() => onOpenJob(j.id)}
              style={[s.job, needsAnswer && s.jobNew]}
            >
              <View style={s.rowBetween}>
                <Text style={s.code}>{j.orderCode}</Text>
                {j.payoutXaf != null && (
                  <Text style={s.payout}>
                    {formatXaf(j.payoutXaf)}
                    {j.payoutIsEstimate ? " est." : ""}
                  </Text>
                )}
              </View>
              <Text style={s.customer}>{j.customerName}</Text>
              <Text style={s.route} numberOfLines={1}>
                {j.pickup.zone ?? j.pickup.text} → {j.delivery.zone ?? j.delivery.text}
              </Text>
              {needsAnswer && <Text style={s.answer}>Tap to accept or decline</Text>}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.ink950 },
  content: { padding: 16, paddingBottom: 48 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { color: c.mist100, fontSize: 28, fontWeight: "700" },
  signOut: { color: c.mist500, fontSize: 14 },
  offline: {
    color: c.caution, fontSize: 13, lineHeight: 19, marginBottom: 12,
    borderColor: c.caution, borderWidth: 1, borderRadius: 12, padding: 12,
  },
  card: {
    backgroundColor: c.ink900, borderColor: c.ink700, borderWidth: 1,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  gold: { borderColor: c.gold },
  caution: { borderColor: c.caution },
  cautionText: { color: c.caution, fontSize: 13, lineHeight: 20, marginTop: 6 },
  cardLabel: { color: c.mist400, fontSize: 13 },
  cardHint: { color: c.mist500, fontSize: 12, marginTop: 2 },
  big: { color: c.gold, fontSize: 28, fontWeight: "700", marginTop: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  section: { color: c.mist500, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginTop: 12, marginBottom: 8 },
  empty: { color: c.mist500, fontSize: 14, textAlign: "center", padding: 32 },
  job: {
    backgroundColor: c.ink900, borderColor: c.ink700, borderWidth: 1,
    borderRadius: 16, padding: 16, marginBottom: 10,
  },
  jobNew: { borderColor: c.gold },
  code: { color: c.gold, fontSize: 16, fontWeight: "700" },
  payout: { color: c.mist300, fontSize: 14, fontWeight: "600" },
  customer: { color: c.mist100, fontSize: 15, marginTop: 4 },
  route: { color: c.mist500, fontSize: 13, marginTop: 2 },
  answer: { color: c.gold, fontSize: 13, fontWeight: "600", marginTop: 8 },
});
