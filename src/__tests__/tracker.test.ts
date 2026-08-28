import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { Tracker } from "../tracker.js";
import { announce, fetchManifestByCode, storeManifest } from "../trackerClient.js";

describe("Tracker + trackerClient (real HTTP round-trip)", () => {
  let tracker: Tracker;
  let url: string;

  beforeEach(async () => {
    tracker = new Tracker();
    await tracker.listen(0); // OS-assigned port
    url = tracker.url;
  });

  afterEach(async () => {
    await tracker.close();
  });

  it("returns an empty peer list for a swarm nobody has announced to yet", async () => {
    const peers = await announce(url, { infoHash: randomBytes(20), peerId: randomBytes(20), port: 9001 });
    expect(peers).toEqual([]);
  });

  it("does not include the announcing peer itself in its own peer list", async () => {
    const infoHash = randomBytes(20);
    const peerId = randomBytes(20);
    const peers = await announce(url, { infoHash, peerId, port: 9001 });
    expect(peers).toEqual([]);
  });

  it("returns previously-announced peers to a new announcer in the same swarm", async () => {
    const infoHash = randomBytes(20);
    const peerA = randomBytes(20);
    const peerB = randomBytes(20);

    await announce(url, { infoHash, peerId: peerA, port: 9001 });
    const seenByB = await announce(url, { infoHash, peerId: peerB, port: 9002 });

    expect(seenByB).toHaveLength(1);
    expect(seenByB[0].peerId).toEqual(peerA);
    expect(seenByB[0].port).toBe(9001);
  });

  it("keeps different info_hash swarms completely separate", async () => {
    const infoHashA = randomBytes(20);
    const infoHashB = randomBytes(20);
    const peer1 = randomBytes(20);
    const peer2 = randomBytes(20);

    await announce(url, { infoHash: infoHashA, peerId: peer1, port: 9001 });
    const seenInB = await announce(url, { infoHash: infoHashB, peerId: peer2, port: 9002 });

    expect(seenInB).toEqual([]);
  });

  it("removes a peer after it announces a 'stopped' event", async () => {
    const infoHash = randomBytes(20);
    const peerA = randomBytes(20);
    const peerB = randomBytes(20);

    await announce(url, { infoHash, peerId: peerA, port: 9001 });
    await announce(url, { infoHash, peerId: peerA, port: 9001, event: "stopped" });
    const seenByB = await announce(url, { infoHash, peerId: peerB, port: 9002 });

    expect(seenByB).toEqual([]);
  });

  it("handles info_hash and peer_id bytes that aren't valid UTF-8, without corruption", async () => {
    // Real SHA-1 hashes are essentially never valid UTF-8 - this is the
    // exact scenario the manual percent-encoding in tracker.ts exists for.
    const infoHash = Buffer.from([0xff, 0x00, 0x9a, 0xc3, 0x28, 0x80, 0x81, 0xfe, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc]);
    const peerA = Buffer.from([0x00, 0xff, 0x00, 0xff, 0xc0, 0xc0, 0xc0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd]);
    const peerB = randomBytes(20);

    await announce(url, { infoHash, peerId: peerA, port: 9001 });
    const seenByB = await announce(url, { infoHash, peerId: peerB, port: 9002 });

    expect(seenByB).toHaveLength(1);
    expect(seenByB[0].peerId).toEqual(peerA);
  });
});

describe("Tracker manifest store (the send/get short-code flow)", () => {
  let tracker: Tracker;
  let baseUrl: string;

  beforeEach(async () => {
    tracker = new Tracker();
    const port = await tracker.listen(0);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await tracker.close();
  });

  it("returns a share code that round-trips back to the exact original bytes", async () => {
    const original = Buffer.from("a bencoded manifest would really go here");
    const code = await storeManifest(baseUrl, original);
    expect(code).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);

    const fetched = await fetchManifestByCode(baseUrl, code);
    expect(fetched).toEqual(original);
  });

  it("gives different manifests different codes", async () => {
    const codeA = await storeManifest(baseUrl, Buffer.from("manifest A"));
    const codeB = await storeManifest(baseUrl, Buffer.from("manifest B"));
    expect(codeA).not.toBe(codeB);
  });

  it("rejects a lookup for a code that was never stored", async () => {
    await expect(fetchManifestByCode(baseUrl, "swift-otter-99")).rejects.toThrow();
  });

  it("rejects a lookup for a code with an invalid shape (path traversal, injection, etc.)", async () => {
    await expect(fetchManifestByCode(baseUrl, "../../../etc/passwd")).rejects.toThrow();
  });

  it("preserves arbitrary binary content, not just text", async () => {
    const original = Buffer.from([0x00, 0xff, 0x10, 0x00, 0xaa, 0xbb, 0x00, 0x00, 0xff]);
    const code = await storeManifest(baseUrl, original);
    expect(await fetchManifestByCode(baseUrl, code)).toEqual(original);
  });
});
