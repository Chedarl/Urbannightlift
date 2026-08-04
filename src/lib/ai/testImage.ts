import { deflateSync, crc32 } from "node:zlib";

/**
 * A PNG built here, rather than a base64 string somebody remembered.
 *
 * The *Test vision* button shipped in v28 carried a hand-written base64
 * constant that I never decoded. It was not a PNG: the IDAT chunk's CRC was
 * wrong, its deflate stream did not inflate, and the file had no IEND. Moonshot
 * answered *"failed to decode image: invalid or unsupported image format"*,
 * which was exactly and entirely correct.
 *
 * That check existed because five vision features had shipped without one
 * ever being proved end to end — and it was itself built on something
 * unexercised. The same mistake, one level up. So the constant is gone and the
 * bytes are constructed: every chunk length, every CRC and the deflate stream
 * are computed, which leaves nothing that can be misremembered.
 *
 * `scripts/verify-image-payload.ts` decodes what this produces and fails the
 * build if any chunk is malformed. PNG validity is fully checkable offline, so
 * there is no excuse for shipping a broken one twice.
 */

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);

  const checksum = Buffer.alloc(4);
  // The CRC covers the type and the data, but not the length — getting that
  // boundary wrong is the classic way to produce a PNG that looks right in a
  // hex dump and is refused by every decoder.
  checksum.writeUInt32BE(crc32(typeAndData) >>> 0, 0);

  return Buffer.concat([length, typeAndData, checksum]);
}

/**
 * A solid square of one colour, as a real PNG.
 *
 * 8-bit RGB, no alpha, no interlacing — the least exotic thing a decoder can be
 * handed. Each scanline is prefixed with filter byte 0 ("none"), which is what
 * the format requires and the most common reason a hand-rolled PNG fails.
 */
export function makeSolidPng(size: number, rgb: [number, number, number]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // colour type 2 = truecolour RGB
  ihdr.writeUInt8(0, 10); // compression: deflate, the only defined value
  ihdr.writeUInt8(0, 11); // filter method
  ihdr.writeUInt8(0, 12); // interlace: none

  // One filter byte then three bytes per pixel, per row.
  const stride = 1 + size * 3;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const at = row + 1 + x * 3;
      raw[at] = rgb[0];
      raw[at + 1] = rgb[1];
      raw[at + 2] = rgb[2];
    }
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The exact image the vision check sends. Red, at 32×32. */
export function visionTestImage(): { bytes: Buffer; dataUrl: string } {
  // Red because it is unambiguous in any language, and because a model
  // inventing an answer has no reason to land on it.
  const bytes = makeSolidPng(32, [220, 38, 38]);
  return { bytes, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
}
