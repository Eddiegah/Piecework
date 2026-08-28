import { describe, it, expect } from "vitest";
import { countSetBits, createBitfield, hasBit, isComplete, missingPieces, setBit } from "../bitfield.js";

describe("bitfield", () => {
  it("starts with every bit unset", () => {
    const bf = createBitfield(10);
    for (let i = 0; i < 10; i++) expect(hasBit(bf, i)).toBe(false);
  });

  it("sizes to the minimum bytes needed, matching the real wire format", () => {
    expect(createBitfield(1)).toHaveLength(1);
    expect(createBitfield(8)).toHaveLength(1);
    expect(createBitfield(9)).toHaveLength(2);
    expect(createBitfield(16)).toHaveLength(2);
  });

  it("setBit only affects the targeted index", () => {
    const bf = createBitfield(10);
    setBit(bf, 3);
    for (let i = 0; i < 10; i++) expect(hasBit(bf, i)).toBe(i === 3);
  });

  it("piece 0 is the high bit of byte 0, per the real bitfield layout", () => {
    const bf = createBitfield(8);
    setBit(bf, 0);
    expect(bf[0]).toBe(0b10000000);
  });

  it("piece 8 lands in the second byte", () => {
    const bf = createBitfield(9);
    setBit(bf, 8);
    expect(bf[0]).toBe(0);
    expect(bf[1]).toBe(0b10000000);
  });

  it("counts set bits correctly, ignoring padding bits beyond pieceCount", () => {
    const bf = createBitfield(3);
    setBit(bf, 0);
    setBit(bf, 2);
    expect(countSetBits(bf, 3)).toBe(2);
  });

  it("isComplete is false until every piece is set, then true", () => {
    const bf = createBitfield(3);
    expect(isComplete(bf, 3)).toBe(false);
    setBit(bf, 0);
    setBit(bf, 1);
    expect(isComplete(bf, 3)).toBe(false);
    setBit(bf, 2);
    expect(isComplete(bf, 3)).toBe(true);
  });

  it("missingPieces lists exactly the unset indices, in order", () => {
    const bf = createBitfield(5);
    setBit(bf, 1);
    setBit(bf, 3);
    expect(missingPieces(bf, 5)).toEqual([0, 2, 4]);
  });
});
