import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPngSize } from "./pngSize.js";

function makeTinyPng(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes.buffer;
}

describe("readPngSize", () => {
  it("reads IHDR dimensions", () => {
    const size = readPngSize(makeTinyPng(860, 160));
    assert.deepEqual(size, { width: 860, height: 160 });
  });

  it("returns null for non-png", () => {
    assert.equal(readPngSize(new Uint8Array([1, 2, 3]).buffer), null);
  });
});
