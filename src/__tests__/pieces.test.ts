import { describe, it, expect } from "vitest";
import { hashPieces, pieceCount, pieceLengthAt, sha1, splitIntoPieces, verifyPiece } from "../pieces.js";
import { createHash } from "node:crypto";

describe("splitIntoPieces", () => {
  it("splits evenly-divisible data into equal pieces", () => {
    const data = Buffer.from("a".repeat(30));
    const pieces = splitIntoPieces(data, 10);
    expect(pieces).toHaveLength(3);
    expect(pieces.every((p) => p.length === 10)).toBe(true);
  });

  it("leaves a shorter final piece for non-divisible data", () => {
    const data = Buffer.from("a".repeat(25));
    const pieces = splitIntoPieces(data, 10);
    expect(pieces.map((p) => p.length)).toEqual([10, 10, 5]);
  });

  it("reassembles back to the exact original bytes", () => {
    const data = Buffer.from(Array.from({ length: 137 }, (_, i) => i % 256));
    const pieces = splitIntoPieces(data, 16);
    expect(Buffer.concat(pieces)).toEqual(data);
  });

  it("produces one empty piece for empty data", () => {
    expect(splitIntoPieces(Buffer.alloc(0), 10)).toEqual([Buffer.alloc(0)]);
  });
});

describe("sha1 / hashPieces / verifyPiece", () => {
  it("matches Node's own crypto SHA-1 output", () => {
    const data = Buffer.from("hello piecework");
    const expected = createHash("sha1").update(data).digest();
    expect(sha1(data)).toEqual(expected);
  });

  it("produces one hash per piece, in order", () => {
    const pieces = [Buffer.from("a"), Buffer.from("b"), Buffer.from("c")];
    const hashes = hashPieces(pieces);
    expect(hashes).toHaveLength(3);
    expect(hashes[1]).toEqual(sha1(Buffer.from("b")));
  });

  it("accepts a piece whose hash matches", () => {
    const piece = Buffer.from("real data");
    expect(verifyPiece(piece, sha1(piece))).toBe(true);
  });

  it("rejects a piece that's been corrupted, even by one byte", () => {
    const original = Buffer.from("real data");
    const hash = sha1(original);
    const corrupted = Buffer.from(original);
    corrupted[0] ^= 0xff;
    expect(verifyPiece(corrupted, hash)).toBe(false);
  });

  it("rejects a piece that's the right length but wrong content", () => {
    const hash = sha1(Buffer.from("expected content"));
    expect(verifyPiece(Buffer.from("different content"), hash)).toBe(false);
  });
});

describe("pieceCount / pieceLengthAt", () => {
  it("computes the expected piece count for divisible and non-divisible sizes", () => {
    expect(pieceCount(30, 10)).toBe(3);
    expect(pieceCount(25, 10)).toBe(3);
    expect(pieceCount(0, 10)).toBe(1);
  });

  it("computes each piece's actual length, including a shorter last piece", () => {
    expect(pieceLengthAt(0, 25, 10)).toBe(10);
    expect(pieceLengthAt(1, 25, 10)).toBe(10);
    expect(pieceLengthAt(2, 25, 10)).toBe(5);
  });

  it("agrees with splitIntoPieces on every piece's length", () => {
    const data = Buffer.from("x".repeat(97));
    const pieceLength = 13;
    const pieces = splitIntoPieces(data, pieceLength);
    pieces.forEach((p, i) => {
      expect(p.length).toBe(pieceLengthAt(i, data.length, pieceLength));
    });
  });
});
