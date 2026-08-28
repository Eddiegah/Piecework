import { describe, it, expect } from "vitest";
import { createManifest, decodeManifest, encodeManifest, infoHash } from "../manifest.js";
import { sha1 } from "../pieces.js";

describe("createManifest", () => {
  it("records the correct piece hashes for the given data", () => {
    const data = Buffer.from("a".repeat(30));
    const manifest = createManifest(data, "file.bin", 10, "http://tracker.local/announce");
    expect(manifest.info.pieces).toHaveLength(3);
    expect(manifest.info.pieces[0]).toEqual(sha1(data.subarray(0, 10)));
    expect(manifest.info.length).toBe(30);
  });
});

describe("encodeManifest / decodeManifest round-trip", () => {
  it("reproduces an identical manifest after encode then decode", () => {
    const data = Buffer.from("some file contents, split into pieces".repeat(5));
    const original = createManifest(data, "notes.txt", 16, "http://tracker.local/announce");
    const decoded = decodeManifest(encodeManifest(original));

    expect(decoded.announce).toBe(original.announce);
    expect(decoded.info.name).toBe(original.info.name);
    expect(decoded.info.pieceLength).toBe(original.info.pieceLength);
    expect(decoded.info.length).toBe(original.info.length);
    expect(decoded.info.pieces).toEqual(original.info.pieces);
  });

  it("rejects a manifest whose piece count doesn't match its declared length", () => {
    const data = Buffer.from("x".repeat(30));
    const manifest = createManifest(data, "f", 10, "http://t/announce");
    const encoded = encodeManifest(manifest);
    // Corrupt it by lying about the total length after the fact.
    const tampered = Buffer.from(encoded.toString("latin1").replace("i30e", "i9999e"), "latin1");
    expect(() => decodeManifest(tampered)).toThrow(/pieces has/);
  });
});

describe("infoHash", () => {
  it("is deterministic: the same info always hashes the same way", () => {
    const data = Buffer.from("consistent content");
    const a = createManifest(data, "f.bin", 8, "http://t/announce");
    const b = createManifest(data, "f.bin", 8, "http://t/announce");
    expect(infoHash(a.info)).toEqual(infoHash(b.info));
  });

  it("changes if the file content changes", () => {
    const a = createManifest(Buffer.from("content A"), "f.bin", 8, "http://t/announce");
    const b = createManifest(Buffer.from("content B"), "f.bin", 8, "http://t/announce");
    expect(infoHash(a.info)).not.toEqual(infoHash(b.info));
  });

  it("changes if the piece length changes, even for identical content", () => {
    const data = Buffer.from("same content, different chunking");
    const a = createManifest(data, "f.bin", 8, "http://t/announce");
    const b = createManifest(data, "f.bin", 16, "http://t/announce");
    expect(infoHash(a.info)).not.toEqual(infoHash(b.info));
  });

  it("does NOT depend on the tracker URL - two trackers can serve the same swarm", () => {
    const data = Buffer.from("shared file content");
    const a = createManifest(data, "f.bin", 8, "http://tracker-one/announce");
    const b = createManifest(data, "f.bin", 8, "http://tracker-two/announce");
    expect(infoHash(a.info)).toEqual(infoHash(b.info));
  });

  it("is 20 bytes, matching a SHA-1 digest", () => {
    const manifest = createManifest(Buffer.from("x"), "f", 4, "http://t/announce");
    expect(infoHash(manifest.info)).toHaveLength(20);
  });
});
