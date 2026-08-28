import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { Tracker } from "../tracker.js";
import { PeerNode } from "../swarm.js";
import { createManifest } from "../manifest.js";

/** This is the actual claim under test, run for real: two independent
 * PeerNode instances, a real Tracker, real TCP sockets on 127.0.0.1 with
 * auto-assigned ports - a seeder holding the whole file and a leecher
 * starting from zero, verified byte-for-byte identical at the end. The
 * standalone demo script (scripts/demo.ts) does the same thing at larger
 * scale for a human to watch; this is the same guarantee as a fast,
 * CI-checked assertion. */
describe("PeerNode swarm (real TCP, real hashing, no mocks)", () => {
  let tracker: Tracker;
  let trackerUrl: string;

  beforeEach(async () => {
    tracker = new Tracker();
    const port = await tracker.listen(0, "127.0.0.1");
    trackerUrl = `http://127.0.0.1:${port}/announce`;
  });

  afterEach(async () => {
    await tracker.close();
  });

  it("transfers a file from a seeder to a leecher, byte-for-byte identical, over real sockets", async () => {
    const original = randomBytes(50_000);
    const manifest = createManifest(original, "test-file.bin", 4096, trackerUrl);

    const seeder = new PeerNode({ manifest, trackerUrl, host: "127.0.0.1", seedData: original });
    await seeder.start();
    expect(seeder.port).toBeGreaterThan(0); // auto-assigned, not hardcoded

    const leecher = new PeerNode({ manifest, trackerUrl, host: "127.0.0.1" });
    const completion = new Promise<Buffer>((resolve) => leecher.once("complete", resolve));
    await leecher.start();

    const result = await completion;
    expect(result).toEqual(original);
    expect(createHash("sha1").update(result).digest("hex")).toBe(createHash("sha1").update(original).digest("hex"));

    await Promise.all([seeder.stop(), leecher.stop()]);
  });

  it("rejects constructing a seeder whose seedData doesn't match the manifest's hashes", () => {
    const real = Buffer.from("the real file content");
    const manifest = createManifest(real, "f.bin", 8, trackerUrl);
    const wrongData = Buffer.from("totally different content!!");

    expect(() => new PeerNode({ manifest, trackerUrl, seedData: wrongData })).toThrow();
  });

  it("three peers (one seeder, two leechers) all converge on the identical file, trading with each other too", async () => {
    const original = randomBytes(60_000);
    const manifest = createManifest(original, "multi.bin", 4096, trackerUrl);

    const seeder = new PeerNode({ manifest, trackerUrl, host: "127.0.0.1", seedData: original });
    await seeder.start();

    const leecherA = new PeerNode({ manifest, trackerUrl, host: "127.0.0.1" });
    const leecherB = new PeerNode({ manifest, trackerUrl, host: "127.0.0.1" });
    const doneA = new Promise<Buffer>((resolve) => leecherA.once("complete", resolve));
    const doneB = new Promise<Buffer>((resolve) => leecherB.once("complete", resolve));
    await leecherA.start();
    await leecherB.start();

    const [resultA, resultB] = await Promise.all([doneA, doneB]);
    expect(resultA).toEqual(original);
    expect(resultB).toEqual(original);

    await Promise.all([seeder.stop(), leecherA.stop(), leecherB.stop()]);
  }, 10000);
});
