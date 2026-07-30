import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { isSignedIn, signOut } from "./src/auth";
import { stopTracking, flush } from "./src/tracking";
import { SignIn } from "./src/screens/SignIn";
import { Tonight } from "./src/screens/Tonight";
import { JobScreen } from "./src/screens/JobScreen";
import { c } from "./src/theme";

// Registers the background location task. Must be imported at module scope, not
// inside a component: the OS can wake the task with no UI mounted at all, and a
// task that is only defined once React renders would simply never fire.
import "./src/tracking";

/**
 * Three screens and no router.
 *
 * A rider is signed in or not; working a job or looking at tonight's list. A
 * navigation library would add a dependency, a bundle, and a set of transitions
 * to configure in exchange for expressing two booleans.
 */
export default function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [openJob, setOpenJob] = useState<string | null>(null);

  useEffect(() => {
    isSignedIn().then((yes) => {
      setSignedIn(yes);
      setReady(true);
      // Anything the last shift queued and could not send goes now, before the
      // rider does anything else.
      if (yes) flush();
    });
  }, []);

  async function handleSignOut() {
    // Order matters: stop tracking before dropping the token, or the final
    // flush has nothing to authenticate with and those positions are lost.
    await stopTracking();
    await signOut();
    setOpenJob(null);
    setSignedIn(false);
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.root} edges={["top", "bottom"]}>
        {!ready ? (
          <View style={s.centre}>
            <ActivityIndicator color={c.gold} />
          </View>
        ) : !signedIn ? (
          <SignIn onSignedIn={() => setSignedIn(true)} />
        ) : openJob ? (
          <JobScreen jobId={openJob} onBack={() => setOpenJob(null)} />
        ) : (
          <Tonight onOpenJob={setOpenJob} onSignOut={handleSignOut} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ink950 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
});
