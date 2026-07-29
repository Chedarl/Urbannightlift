/**
 * Getting the Google ownership token out of whatever gets pasted.
 *
 * Search Console shows a full `<meta>` tag and the instructions say to copy it,
 * so that is what people copy. Storing that verbatim renders a meta tag whose
 * content is another meta tag, Google does not find its token, and the failure
 * message — "we couldn't find your verification meta tag" — gives no hint what
 * went wrong. Accepting every reasonable paste is cheaper than explaining.
 */
export {};

const TOKEN = "dQJhYad8bGSfFKW4ep6L9IWHa1b2c3d4e5f6g7h8";

/** The exact normalisation the settings route applies. */
function extract(raw: string): string | null {
  const trimmed = raw.trim();
  const fromTag = trimmed.match(/content=["']([^"']+)["']/)?.[1];
  const fromPair = trimmed.match(/google-site-verification[=:]\s*([\w-]+)/)?.[1];
  return (fromTag ?? fromPair ?? trimmed).trim() || null;
}

let failures = 0;
function check(name: string, got: string | null, want: string | null) {
  if (got === want) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}\n        got  ${got}\n        want ${want}`);
  }
}

console.log("\n— what people actually paste —");

check("the whole meta tag, as Search Console shows it",
  extract(`<meta name="google-site-verification" content="${TOKEN}" />`), TOKEN);

check("the meta tag with single quotes",
  extract(`<meta name='google-site-verification' content='${TOKEN}' />`), TOKEN);

check("the meta tag with surrounding whitespace",
  extract(`\n   <meta name="google-site-verification" content="${TOKEN}" />  \n`), TOKEN);

check("the DNS-style pair from the other tab",
  extract(`google-site-verification=${TOKEN}`), TOKEN);

check("the bare token, which is what we ask for",
  extract(TOKEN), TOKEN);

check("an empty box clears it rather than storing nothing-ish",
  extract("   "), null);

console.log("\n— the failure this replaces —");
// Storing the paste verbatim renders a meta tag whose content is another meta
// tag, which is exactly why Google reported it could not find the token.
const naive: string = `<meta name="google-site-verification" content="${TOKEN}" />`;
check("the raw paste is not itself the token", naive.includes("<meta") ? "not-a-token" : TOKEN, "not-a-token");
check("but extraction recovers it", extract(naive), TOKEN);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
