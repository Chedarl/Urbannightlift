/**
 * Why an iPhone could not open the site.
 *
 * Safari refuses a redirected response served by a service worker for a page
 * navigation — it fails the load and shows nothing. Chrome accepts it, which is
 * why this only ever showed up on iPhones, and on every iPhone browser at once,
 * because they all run WebKit.
 *
 * This exercises the worker's navigation handler against a fake `fetch` to
 * prove a redirected response is rebuilt without the redirect flag, that a
 * normal response is passed through untouched, and that a dead network still
 * falls back to the offline page. It also checks the iOS detection that decides
 * whether the worker should exist on a device at all.
 */

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

/** The exact navigation branch shipped in public/sw.js. */
async function handleNavigation(
  request: Request,
  doFetch: (r: Request) => Promise<Response>,
  offline: () => Promise<Response | undefined>
): Promise<Response> {
  try {
    const response = await doFetch(request);
    if (!response.redirected) return response;
    const body = await response.blob();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return (await offline()) ?? Response.error();
  }
}

/** A Response that reports itself as redirected, like a real 307 followed. */
function redirectedResponse(body: string): Response {
  const r = new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  Object.defineProperty(r, "redirected", { value: true });
  return r;
}

const OFFLINE = () => Promise.resolve(new Response("offline", { status: 200 }));

async function main() {
  console.log("\n— the bug that blanked iPhones —");

  // /account, /admin and /rider all 307 to a login, so a real visit produces
  // exactly this shape.
  const req = new Request("https://urbannighlift.com/account", { method: "GET" });
  const out = await handleNavigation(req, () => Promise.resolve(redirectedResponse("<html>login</html>")), OFFLINE);

  check("the redirect flag is gone — Safari will accept it", out.redirected === false);
  check("the status survives", out.status === 200);
  check("the page content survives", (await out.text()).includes("login"));

  console.log("\n— ordinary navigations are untouched —");
  const plain = new Response("<html>home</html>", { status: 200 });
  const same = await handleNavigation(req, () => Promise.resolve(plain), OFFLINE);
  check("the very same response object is passed through", same === plain);

  console.log("\n— a dead network still gets the offline page —");
  const off = await handleNavigation(req, () => Promise.reject(new Error("offline")), OFFLINE);
  check("falls back rather than failing", off.status === 200 && (await off.text()) === "offline");

  const noCache = await handleNavigation(req, () => Promise.reject(new Error("offline")), async () => undefined);
  check("and errors safely when even that is missing", noCache.type === "error");

  console.log("\n— which devices should run a worker at all —");
  const decide = (ua: string, platform: string, touch: number, installed: boolean) => {
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && touch > 1);
    return isIOS && !installed ? "unregister" : "register";
  };
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
  const IPAD_DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const ANDROID =
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

  check("iPhone Safari: worker removed", decide(IPHONE, "iPhone", 5, false) === "unregister");
  check("iPad pretending to be a Mac: also removed", decide(IPAD_DESKTOP_UA, "MacIntel", 5, false) === "unregister");
  check("a real Mac keeps it", decide(IPAD_DESKTOP_UA, "MacIntel", 0, false) === "register");
  check("Android keeps it — the install prompt needs it", decide(ANDROID, "Linux armv8l", 5, false) === "register");
  check(
    "an installed iOS app keeps it — Web Push needs it",
    decide(IPHONE, "iPhone", 5, true) === "register"
  );

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
