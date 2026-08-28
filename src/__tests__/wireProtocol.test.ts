import { describe, it, expect } from "vitest";
import {
  encodeHandshake,
  tryDecodeHandshake,
  encodeMessage,
  tryDecodeMessage,
  WireMessage,
} from "../wireProtocol.js";
import { randomBytes } from "node:crypto";

describe("handshake", () => {
  it("round-trips infoHash and peerId exactly", () => {
    const infoHash = randomBytes(20);
    const peerId = randomBytes(20);
    const encoded = encodeHandshake({ infoHash, peerId });
    const result = tryDecodeHandshake(encoded);
    expect(result).not.toBeNull();
    expect(result!.handshake.infoHash).toEqual(infoHash);
    expect(result!.handshake.peerId).toEqual(peerId);
    expect(result!.consumed).toBe(encoded.length);
  });

  it("is exactly 68 bytes, matching the real BitTorrent handshake length", () => {
    const encoded = encodeHandshake({ infoHash: randomBytes(20), peerId: randomBytes(20) });
    expect(encoded.length).toBe(68);
  });

  it("returns null (not a throw) when given a partial handshake", () => {
    const full = encodeHandshake({ infoHash: randomBytes(20), peerId: randomBytes(20) });
    expect(tryDecodeHandshake(full.subarray(0, 30))).toBeNull();
    expect(tryDecodeHandshake(Buffer.alloc(0))).toBeNull();
  });

  it("rejects a wrong-length infoHash or peerId at encode time", () => {
    expect(() => encodeHandshake({ infoHash: randomBytes(19), peerId: randomBytes(20) })).toThrow();
    expect(() => encodeHandshake({ infoHash: randomBytes(20), peerId: randomBytes(21) })).toThrow();
  });
});

describe("messages: round-trip every message type", () => {
  const cases: WireMessage[] = [
    { type: "keep-alive" },
    { type: "choke" },
    { type: "unchoke" },
    { type: "interested" },
    { type: "not-interested" },
    { type: "have", index: 7 },
    { type: "bitfield", bitfield: Buffer.from([0b11010000, 0b00000001]) },
    { type: "request", index: 3, begin: 16384, length: 16384 },
    { type: "piece", index: 3, begin: 0, block: Buffer.from("some real piece bytes") },
    { type: "cancel", index: 3, begin: 16384, length: 16384 },
  ];

  for (const msg of cases) {
    it(`round-trips a "${msg.type}" message`, () => {
      const encoded = encodeMessage(msg);
      const result = tryDecodeMessage(encoded);
      expect(result).not.toBeNull();
      expect(result!.message).toEqual(msg);
      expect(result!.consumed).toBe(encoded.length);
    });
  }
});

describe("streaming / partial-buffer behavior", () => {
  it("returns null when fewer than 4 bytes (the length prefix) are available", () => {
    expect(tryDecodeMessage(Buffer.from([0, 0]))).toBeNull();
  });

  it("returns null when the length prefix promises more bytes than are present", () => {
    const encoded = encodeMessage({ type: "have", index: 1 });
    expect(tryDecodeMessage(encoded.subarray(0, encoded.length - 1))).toBeNull();
  });

  it("decodes the first message and reports how many bytes it consumed, ignoring trailing data", () => {
    const first = encodeMessage({ type: "choke" });
    const second = encodeMessage({ type: "unchoke" });
    const combined = Buffer.concat([first, second]);

    const result = tryDecodeMessage(combined);
    expect(result!.message).toEqual({ type: "choke" });
    expect(result!.consumed).toBe(first.length);

    const next = tryDecodeMessage(combined.subarray(result!.consumed));
    expect(next!.message).toEqual({ type: "unchoke" });
  });

  it("handles a message split across two chunks, the way a real socket delivers them", () => {
    const encoded = encodeMessage({ type: "piece", index: 0, begin: 0, block: Buffer.from("chunked delivery") });
    const chunkA = encoded.subarray(0, 6);
    const chunkB = encoded.subarray(6);

    expect(tryDecodeMessage(chunkA)).toBeNull();
    const result = tryDecodeMessage(Buffer.concat([chunkA, chunkB]));
    expect(result!.message).toEqual({ type: "piece", index: 0, begin: 0, block: Buffer.from("chunked delivery") });
  });
});
