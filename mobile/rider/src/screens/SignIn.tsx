import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { signIn } from "../auth";
import { c } from "../theme";

/**
 * One field, one field, one button.
 *
 * A rider signs in once and then not again for months, so this screen's only
 * job is to be impossible to get wrong on a cracked phone in the dark. The
 * credentials are the ones they already use on the website — there is no
 * separate mobile account, deliberately.
 */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) onSignedIn();
    else setError(result.error ?? "Try again.");
  }

  return (
    <View style={s.wrap}>
      <View style={s.mark}>
        <Text style={s.markText}>UNL</Text>
      </View>
      <Text style={s.title}>Rider sign in</Text>
      <Text style={s.sub}>Use the same email and password you use on the website.</Text>

      <TextInput
        style={s.input}
        placeholder="Email"
        placeholderTextColor={c.mist500}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.input}
        placeholder="Password"
        placeholderTextColor={c.mist500}
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable
        style={[s.button, (busy || !email || !password) && s.buttonOff]}
        onPress={submit}
        disabled={busy || !email || !password}
      >
        {busy ? <ActivityIndicator color={c.ink950} /> : <Text style={s.buttonText}>Sign in</Text>}
      </Pressable>

      {/* Said here because a rider will be asked for it by somebody one day. */}
      <Text style={s.note}>
        We will never ask for your MTN MoMo or Orange Money PIN. Not here, not on the phone,
        not ever.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: c.ink950 },
  mark: {
    width: 56, height: 56, borderRadius: 28, alignSelf: "center",
    alignItems: "center", justifyContent: "center", backgroundColor: c.violet, marginBottom: 24,
  },
  markText: { color: c.mist100, fontWeight: "700", fontSize: 16 },
  title: { color: c.mist100, fontSize: 28, fontWeight: "700", textAlign: "center" },
  sub: { color: c.mist400, fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 24, lineHeight: 20 },
  input: {
    backgroundColor: c.ink900, borderColor: c.ink700, borderWidth: 1, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14, color: c.mist100, fontSize: 16, marginBottom: 12,
  },
  error: { color: c.restricted, fontSize: 14, marginBottom: 12 },
  button: {
    backgroundColor: c.gold, borderRadius: 16, paddingVertical: 16,
    alignItems: "center", marginTop: 4,
  },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: c.ink950, fontSize: 16, fontWeight: "700" },
  note: { color: c.mist500, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 24 },
});
