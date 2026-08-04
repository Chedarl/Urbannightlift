/**
 * Decodes the image this product actually sends, and refuses to let a broken
 * one ship again.
 *
 * Twice in a row the instrument was the problem. First, five vision features
 * shipped handing Moonshot a remote URL it does not accept — caught only
 * because a button was added to test them. Then that button sent a base64 PNG I
 * had written from memory, whose IDAT chunk had a wrong CRC, would not inflate,
 * and had no IEND. Moonshot said *"failed to decode image"* and was completely
 * right both times.
 *
 * The common thread is not the bug, it is the habit: something was asserted to
 * work without ever being executed. **PNG validity is fully checkable offline
 * with no API key**, so there was never an excuse.
 *
 * So this decodes the exact bytes `visionTestImage()` produces — chunk by chunk,
 * CRC by CRC, inflating the pixel data — and checks that a data URI can never
 * again claim a format its bytes do not have.
 *
 * Run: npx tsx scripts/verify-image-payload.ts
 */
import { inflateSync, crc32 } from "node:zlib";
import { makeSolidPng, visionTestImage } from "../src/lib/ai/testImage";
import { sniffImageMime } from "../src/lib/ai/images";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

interface Chunk {
  type: string;
  data: Buffer;
  crcOk: boolean;
}

/** Walks a PNG the way a decoder does, so a lie here is a lie there. */
function readChunks(png: Buffer): { chunks: Chunk[]; signatureOk: boolean; complete: boolean } {
  const signatureOk =
    png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const chunks: Chunk[] = [];
  let at = 8;
  let complete = false;

  while (at + 12 <= png.length) {
    const length = png.readUInt32BE(at);
    if (at + 12 + length > png.length) break;
    const type = png.toString("ascii", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    const stored = png.readUInt32BE(at + 8 + length);
    const computed = crc32(png.subarray(at + 4, at + 8 + length)) >>> 0;
    chunks.push({ type, data, crcOk: stored === computed });
    at += 12 + length;
    if (type === "IEND") {
      complete = at === png.length;
      break;
    }
  }
  return { chunks, signatureOk, complete };
}

console.log("\nThe image the Test vision button actually sends");
const { bytes, dataUrl } = visionTestImage();
const { chunks, signatureOk, complete } = readChunks(bytes);

check("the PNG signature is right", signatureOk, bytes.subarray(0, 8).toString("hex"));
check(
  "the chunks are IHDR, IDAT, IEND in order",
  chunks.map((c) => c.type).join(",") === "IHDR,IDAT,IEND",
  chunks.map((c) => c.type).join(",") || "none read"
);
check(
  "every CRC is correct",
  chunks.length > 0 && chunks.every((c) => c.crcOk),
  chunks.map((c) => `${c.type}:${c.crcOk ? "ok" : "BAD"}`).join(" ") +
    "  ← a wrong CRC is exactly what shipped last time"
);
check("the file ends at IEND, nothing truncated", complete);

const ihdr = chunks.find((c) => c.type === "IHDR");
check(
  "IHDR says 32×32, 8-bit, truecolour, no interlace",
  !!ihdr &&
    ihdr.data.readUInt32BE(0) === 32 &&
    ihdr.data.readUInt32BE(4) === 32 &&
    ihdr.data[8] === 8 &&
    ihdr.data[9] === 2 &&
    ihdr.data[12] === 0
);

const idat = chunks.find((c) => c.type === "IDAT");
let inflated: Buffer | null = null;
try {
  inflated = idat ? inflateSync(idat.data) : null;
} catch (e) {
  check("the pixel data inflates", false, String(e));
}
if (inflated) {
  // One filter byte plus three bytes a pixel, per row.
  const expected = 32 * (1 + 32 * 3);
  check("the pixel data inflates to exactly one image", inflated.length === expected, `${inflated.length} vs ${expected}`);
  check("every row carries filter byte 0", Array.from({ length: 32 }, (_, y) => inflated![y * (1 + 96)]).every((b) => b === 0));
  check(
    "and the pixels really are red",
    inflated[1] === 220 && inflated[2] === 38 && inflated[3] === 38,
    `got ${inflated[1]},${inflated[2]},${inflated[3]}`
  );
}

console.log("\nThe data URI cannot claim a format its bytes do not have");
check("it is declared as a PNG", dataUrl.startsWith("data:image/png;base64,"));
check(
  "and the bytes agree",
  sniffImageMime(bytes) === "image/png",
  "the declared type is derived from the same bytes, so the two cannot drift"
);
check(
  "it round-trips through base64 unchanged",
  Buffer.from(dataUrl.split(",")[1], "base64").equals(bytes)
);

console.log("\nSniffing real headers");
check("PNG", sniffImageMime(makeSolidPng(4, [0, 0, 0])) === "image/png");
check(
  "JPEG",
  sniffImageMime(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])) === "image/jpeg"
);
check(
  "WebP",
  sniffImageMime(
    Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)])
  ) === "image/webp"
);
check("GIF", sniffImageMime(Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16)])) === "image/gif");

console.log("\nAnd refusing everything that is not an image");
check("HTML — what an expired storage link returns", sniffImageMime(Buffer.from("<!DOCTYPE html><html>...")) === null);
check("JSON — what a storage error returns", sniffImageMime(Buffer.from('{"error":"not found","x":1}')) === null);
check("plain text", sniffImageMime(Buffer.from("this is not a picture at all")) === null);
check("an empty buffer", sniffImageMime(Buffer.alloc(0)) === null);
check("a few stray bytes", sniffImageMime(Buffer.from([0x00, 0x01, 0x02])) === null);
check(
  "a PNG signature with nothing behind it is still refused as too short",
  sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])) === null,
  "twelve bytes is the floor, because a header alone decodes to no picture"
);

console.log(
  `\n${
    failures === 0
      ? "The bytes we send are a real image, and we can prove it without a key."
      : `${failures} check(s) FAILED — do not ship this.`
  }\n`
);
process.exit(failures === 0 ? 0 : 1);
