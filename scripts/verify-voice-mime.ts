/**
 * Why voice notes failed to upload.
 *
 * MediaRecorder does not report a bare MIME type — Chrome on Android says
 * `audio/webm;codecs=opus`. That string became `file.type` and then the upload
 * Content-Type, and storage matches its allow-list exactly, so every recording
 * made on the most common phone in this market was rejected after recording
 * apparently fine.
 *
 * These are the exact strings the browsers produce.
 */

// Marks this file as a module. Without an import or export TypeScript treats a
// script as global scope, where its `failures` collides with the identically
// named one in the sibling verify scripts and the build fails.
export {};

function baseMime(mimeType: string): string {
  return (mimeType.split(";")[0] || "").trim().toLowerCase() || "audio/webm";
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

/** The bucket allow-list, as provisioned. */
const ALLOWED = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/aac"];

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

// What each browser's MediaRecorder actually reports.
const REAL_WORLD: { browser: string; reported: string; ext: string }[] = [
  { browser: "Chrome / Android", reported: "audio/webm;codecs=opus", ext: "webm" },
  { browser: "Chrome desktop", reported: "audio/webm;codecs=opus", ext: "webm" },
  { browser: "Safari / iOS 17", reported: "audio/mp4", ext: "m4a" },
  { browser: "Safari / iOS 16", reported: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
  { browser: "Firefox / Android", reported: "audio/ogg;codecs=opus", ext: "ogg" },
  { browser: "Samsung Internet", reported: "audio/webm; codecs=opus", ext: "webm" },
  { browser: "nothing reported", reported: "", ext: "webm" },
];

console.log("\n— the Content-Type storage will actually receive —");
for (const { browser, reported, ext } of REAL_WORLD) {
  const type = baseMime(reported);
  check(
    `${browser}: "${reported || "(empty)"}" → ${type}`,
    ALLOWED.includes(type),
    `rejected by the bucket`
  );
  check(`${browser}: saved as .${ext}`, extensionFor(type) === ext, `got .${extensionFor(type)}`);
}

console.log("\n— the old behaviour, for comparison —");
const before = "audio/webm;codecs=opus";
check(
  "the raw recorder string was NOT accepted (this was the bug)",
  !ALLOWED.includes(before)
);
check("stripping the codec fixes it", ALLOWED.includes(baseMime(before)));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
