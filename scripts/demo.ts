/** The actual proof, not a claim in a README: builds a real manifest for a
 * random test file, starts a real HTTP tracker and four independent peer
 * nodes (one seeder holding the whole file, three leechers starting from
 * zero), lets them find each other and trade pieces over genuine TCP
 * sockets speaking the real peer wire protocol, then verifies every
 * leecher reassembled the file byte-for-byte identical to the original -
 * having only ever received it in independently hash-verified pieces from
 * whichever peer happened to have them, seeder or fellow leecher alike. */

import { randomBytes, createHash } from "node:crypto";
import { createManifest } from "../src/manifest.js";
import { Tracker } from "../src/tracker.js";
import { PeerNode } from "../src/swarm.js";

const FILE_SIZE = 200_000;
const PIECE_LENGTH = 16_384; // the real BitTorrent default block size
const NUM_LEECHERS = 3;
const BASE_PORT = 9001;

async function main() {
  console.log("Piecework demo — a real multi-peer file transfer over the actual BitTorrent wire protocol\n");

  const original = randomBytes(FILE_SIZE);
  const originalHash = createHash("sha1").update(original).digest("hex");
  console.log(`Test file:  ${FILE_SIZE.toLocaleString()} random bytes, sha1 ${originalHash}`);

  const tracker = new Tracker();
  const trackerPort = await tracker.listen();
  const trackerUrl = `http://127.0.0.1:${trackerPort}/announce`;
  console.log(`Tracker:    listening on 127.0.0.1:${trackerPort}`);

  const manifest = createManifest(original, "demo-file.bin", PIECE_LENGTH, trackerUrl);
  console.log(`Manifest:   ${manifest.info.pieces.length} pieces, up to ${PIECE_LENGTH.toLocaleString()} bytes each\n`);

  const seeder = new PeerNode({ manifest, trackerUrl, port: BASE_PORT, seedData: original });
  await seeder.start();
  console.log(`Seeder online   (127.0.0.1:${BASE_PORT}) — starts at 100%`);

  const leechers: PeerNode[] = [];
  for (let i = 0; i < NUM_LEECHERS; i++) {
    const port = BASE_PORT + 1 + i;
    const node = new PeerNode({ manifest, trackerUrl, port });
    leechers.push(node);
    await node.start();
    console.log(`Leecher ${i + 1} online  (127.0.0.1:${port}) — starts at 0%`);
  }

  console.log("\nTrading pieces...\n");

  const completions = leechers.map(
    (node) => new Promise<Buffer>((resolve) => node.once("complete", resolve))
  );

  const statusLine = () =>
    `  ${seeder.haveCount}/${seeder.pieceCount} seeder   ` +
    leechers.map((l, i) => `leecher ${i + 1}: ${l.haveCount}/${l.pieceCount}`).join("   ");

  const statusTimer = setInterval(() => process.stdout.write(`\r${statusLine()}`), 100);
  const results = await Promise.all(completions);
  clearInterval(statusTimer);
  process.stdout.write(`\r${statusLine()}\n`);

  console.log("\nAll leechers report complete. Verifying byte-for-byte against the original...\n");

  let allPass = true;
  results.forEach((data, i) => {
    const hash = createHash("sha1").update(data).digest("hex");
    const matches = data.equals(original);
    console.log(`  leecher ${i + 1}: sha1 ${hash}  ${matches ? "MATCHES original ✅" : "MISMATCH ❌"}`);
    if (!matches) allPass = false;
  });

  await Promise.all([seeder.stop(), ...leechers.map((l) => l.stop())]);
  await tracker.close();

  console.log(
    allPass
      ? "\nPASS — every leecher reassembled the exact original file, byte for byte, using only pieces traded peer-to-peer.\n"
      : "\nFAIL — at least one leecher's reassembled file did not match the original.\n"
  );
  // process.exitCode (not process.exit()) lets the event loop drain the
  // socket-close callbacks from the stop() calls above naturally, instead
  // of racing them - forcing an immediate exit here was observed to
  // occasionally crash with a libuv handle-teardown assertion on Windows.
  process.exitCode = allPass ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
