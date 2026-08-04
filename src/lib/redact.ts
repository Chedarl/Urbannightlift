/**
 * Strips anything credential-shaped out of text before it is stored or shown.
 *
 * This exists because of a real leak, not a hypothetical one. A Kimi API key was
 * pasted into Vercel several times over, which made an `Authorization` header
 * containing spaces; `Headers.append` rejected it and threw an error whose
 * message quoted **the entire header back**. That message was written to
 * `AiCall.error` and rendered on `/admin/settings`. The key reached the database
 * and a browser window.
 *
 * The habit that caused it is one worth keeping: this codebase quotes provider
 * errors verbatim everywhere, because their exact wording is what turns a silent
 * failure into a five-second diagnosis. Google's referrer message, Resend's
 * domain-verification message and MapTiler's 404 each saved a day that way.
 *
 * So the answer is not to stop quoting them — it is to scrub on the way in, in
 * one place, so no future call site has to remember.
 *
 * Deliberately blunt. An over-redacted error message costs somebody a little
 * context; an under-redacted one puts a live key in a table and on a screen.
 */
export function redactSecrets(text: string): string {
  return (
    text
      // Moonshot/OpenAI-style keys, and the header they usually arrive in.
      .replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-***")
      .replace(/Bearer\s+[A-Za-z0-9_\-.]{16,}/gi, "Bearer ***")
      // Anything that looks like a key in a query string — the shape every map
      // provider uses, and the reason a tile URL must never be logged raw.
      .replace(/([?&](?:key|api[_-]?key|token|access[_-]?token)=)[^&\s"']+/gi, "$1***")
      // A long unbroken token with no spaces is not prose. Whatever it is, it is
      // not worth the risk of printing.
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "***")
  );
}
