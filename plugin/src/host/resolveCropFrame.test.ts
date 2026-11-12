import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isImageLikeItem,
  resolveToCropFrame,
  uniqueResolvedTargets,
} from "./resolveCropFrame.js";

function fake(name: string, id: number, parent?: any, bounds = [0, 0, 10, 10]) {
  return {
    constructor: { name },
    id,
    parent,
    geometricBounds: bounds,
  };
}

describe("resolveToCropFrame", () => {
  it("detects image-like names", () => {
    assert.equal(isImageLikeItem(fake("Image", 1)), true);
    assert.equal(isImageLikeItem(fake("Rectangle", 2)), false);
  });

  it("lifts Image to parent Rectangle crop frame", () => {
    const frame = fake("Rectangle", 10, null, [0, 0, 20, 80]);
    const image = fake("Image", 11, frame, [-5, -5, 40, 120]);
    const r = resolveToCropFrame(image);
    assert.equal(r.liftedFromImage, true);
    assert.equal(r.target.id, 10);
    assert.equal(r.imageId, "11");
  });

  it("keeps Rectangle as-is", () => {
    const frame = fake("Rectangle", 10);
    const r = resolveToCropFrame(frame);
    assert.equal(r.liftedFromImage, false);
    assert.equal(r.target.id, 10);
  });

  it("dedupes image + its frame in one selection", () => {
    const frame = fake("Rectangle", 10);
    const image = fake("Image", 11, frame);
    const { targets, liftedCount } = uniqueResolvedTargets([image, frame]);
    assert.equal(targets.length, 1);
    assert.equal(targets[0]!.id, 10);
    assert.equal(liftedCount, 1);
  });
});
