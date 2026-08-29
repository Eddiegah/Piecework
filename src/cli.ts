#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createManifest, decodeManifest, encodeManifest } from "./manifest.js";
import { Tracker } from "./tracker.js";
import { PeerNode } from "./swarm.js";
import { announceUrlFor, fetchManifestByCode, storeManifest } from "./trackerClient.js";
import { getLanAddress } from "./network.js";

const DEFAULT_LOCAL_TRACKER = "http://127.0.0.1:6969";
const DEFAULT_PUBLIC_TRACKER = process.env.PIECEWORK_TRACKER ?? "https://piecework.onrender.com";
const DEFAULT_PIECE_LENGTH = 16384;

const NETWORK_NOTE =
  "Works instantly with anyone on the same WiFi/network. Different networks (over the open\n" +
  "internet) usually need the sender's router to forward the port shown above - that's a\n" +
  "limitation of peer-to-peer itself, not this tool (real BitTorrent has the same issue without\n" +
  "UPnP/DHT, neither of which this implements).";

const program = new Command();
program.name("piecework").description("A real peer-to-peer file-sharing protocol, implemented from scratch.");

program
  .command("send <file>")
  .description("Share a file instantly - prints a short code for the other person to use")
  .option("--tracker <url>", "tracker base URL", DEFAULT_PUBLIC_TRACKER)
  .action(async (file: string, opts: { tracker: string }) => {
    const data = await readFile(file);
    const manifest = createManifest(data, path.basename(file), DEFAULT_PIECE_LENGTH, announceUrlFor(opts.tracker));
    const code = await storeManifest(opts.tracker, encodeManifest(manifest));

    const node = new PeerNode({ manifest, trackerUrl: manifest.announce, seedData: data });
    await node.start();

    const lan = getLanAddress();
    console.log(`\nShare this code:  ${code}\n`);
    console.log(`They run:  npx piecework get ${code}\n`);
    console.log(`Sending "${file}" (${data.length.toLocaleString()} bytes) from ${lan ?? "this machine"}:${node.port}`);
    console.log(`Keep this running until they've finished downloading.\n`);
    console.log(NETWORK_NOTE);
  });

program
  .command("get <code> [output]")
  .description("Download a file someone shared, by its code")
  .option("--tracker <url>", "tracker base URL", DEFAULT_PUBLIC_TRACKER)
  .action(async (code: string, output: string | undefined, opts: { tracker: string }) => {
    console.log(`Looking up code "${code}"...`);
    const manifestBytes = await fetchManifestByCode(opts.tracker, code);
    const manifest = decodeManifest(manifestBytes);
    const outputPath = output ?? manifest.info.name;

    console.log(`Found "${manifest.info.name}" (${manifest.info.length.toLocaleString()} bytes, ${manifest.info.pieces.length} pieces)`);
    console.log("Connecting to peers and downloading...");

    const node = new PeerNode({
      manifest,
      trackerUrl: manifest.announce,
      onProgress: (have, total) => process.stdout.write(`\r${have}/${total} pieces`),
    });
    node.once("complete", async (data: Buffer) => {
      await writeFile(outputPath, data);
      console.log(`\nSaved ${outputPath}`);
      await node.stop();
      // By this point every socket this process opened has been closed and
      // awaited - the only thing left alive is Node's own fetch() keep-alive
      // connection to the tracker, which there's no public API to close.
      // process.exitCode alone would leave the process hanging on that; a
      // forced exit() here is safe (unlike inside PeerNode.stop() itself)
      // because nothing is still mid-teardown.
      process.exit(0);
    });
    await node.start();
  });

program
  .command("tracker")
  .description("Run a tracker server that peers announce themselves to and manifests are shared through")
  .option("-p, --port <port>", "port to listen on", "6969")
  .option("--host <host>", "interface to listen on", "0.0.0.0")
  .action(async (opts: { port: string; host: string }) => {
    const tracker = new Tracker();
    const port = await tracker.listen(Number(opts.port), opts.host);
    const lan = getLanAddress();
    console.log(`Tracker listening on http://${opts.host}:${port}`);
    if (lan) console.log(`Reachable on your network at http://${lan}:${port}`);
  });

program
  .command("create <file>")
  .description("Create a .piecework manifest describing a file")
  .option("--tracker <url>", "tracker base URL", DEFAULT_LOCAL_TRACKER)
  .option("--piece-length <bytes>", "bytes per piece", String(DEFAULT_PIECE_LENGTH))
  .action(async (file: string, opts: { tracker: string; pieceLength: string }) => {
    const data = await readFile(file);
    const manifest = createManifest(data, path.basename(file), Number(opts.pieceLength), announceUrlFor(opts.tracker));
    const outPath = `${file}.piecework`;
    await writeFile(outPath, encodeManifest(manifest));
    console.log(`Wrote ${outPath} — ${manifest.info.pieces.length} pieces, ${data.length.toLocaleString()} bytes`);
  });

program
  .command("seed <file> <manifest>")
  .description("Seed a complete file into its swarm")
  .option("-p, --port <port>", "port to listen on (default: automatic)")
  .action(async (file: string, manifestPath: string, opts: { port?: string }) => {
    const data = await readFile(file);
    const manifest = decodeManifest(await readFile(manifestPath));
    const node = new PeerNode({
      manifest,
      trackerUrl: manifest.announce,
      port: opts.port ? Number(opts.port) : undefined,
      seedData: data,
    });
    await node.start();
    console.log(`Seeding ${file} on port ${node.port} — ${node.haveCount}/${node.pieceCount} pieces available`);
  });

program
  .command("leech <manifest> <output>")
  .description("Download a file from its swarm, verifying every piece as it arrives")
  .option("-p, --port <port>", "port to listen on (default: automatic)")
  .action(async (manifestPath: string, output: string, opts: { port?: string }) => {
    const manifest = decodeManifest(await readFile(manifestPath));
    const node = new PeerNode({
      manifest,
      trackerUrl: manifest.announce,
      port: opts.port ? Number(opts.port) : undefined,
      onProgress: (have, total) => process.stdout.write(`\r${have}/${total} pieces`),
    });
    node.once("complete", async (data: Buffer) => {
      await writeFile(output, data);
      console.log(`\nSaved ${output}`);
      await node.stop();
      process.exit(0); // see the comment on the same pattern in the `get` command above
    });
    await node.start();
  });

program.parse();
