#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createManifest, decodeManifest, encodeManifest } from "./manifest.js";
import { Tracker } from "./tracker.js";
import { PeerNode } from "./swarm.js";

const program = new Command();
program.name("piecework").description("A real peer-to-peer file-sharing protocol, implemented from scratch.");

program
  .command("tracker")
  .description("Run a tracker server that peers announce themselves to")
  .option("-p, --port <port>", "port to listen on", "6969")
  .action(async (opts) => {
    const tracker = new Tracker();
    const port = await tracker.listen(Number(opts.port));
    console.log(`Tracker listening on http://127.0.0.1:${port}/announce`);
  });

program
  .command("create <file>")
  .description("Create a .piecework manifest describing a file")
  .option("--tracker <url>", "tracker announce URL", "http://127.0.0.1:6969/announce")
  .option("--piece-length <bytes>", "bytes per piece", "16384")
  .action(async (file: string, opts: { tracker: string; pieceLength: string }) => {
    const data = await readFile(file);
    const manifest = createManifest(data, path.basename(file), Number(opts.pieceLength), opts.tracker);
    const outPath = `${file}.piecework`;
    await writeFile(outPath, encodeManifest(manifest));
    console.log(`Wrote ${outPath} — ${manifest.info.pieces.length} pieces, ${data.length.toLocaleString()} bytes`);
  });

program
  .command("seed <file> <manifest>")
  .description("Seed a complete file into its swarm")
  .option("-p, --port <port>", "port to listen on", "9001")
  .action(async (file: string, manifestPath: string, opts: { port: string }) => {
    const data = await readFile(file);
    const manifest = decodeManifest(await readFile(manifestPath));
    const node = new PeerNode({ manifest, trackerUrl: manifest.announce, port: Number(opts.port), seedData: data });
    await node.start();
    console.log(`Seeding ${file} on 127.0.0.1:${opts.port} — ${node.haveCount}/${node.pieceCount} pieces available`);
  });

program
  .command("leech <manifest> <output>")
  .description("Download a file from its swarm, verifying every piece as it arrives")
  .option("-p, --port <port>", "port to listen on", "9002")
  .action(async (manifestPath: string, output: string, opts: { port: string }) => {
    const manifest = decodeManifest(await readFile(manifestPath));
    const node = new PeerNode({
      manifest,
      trackerUrl: manifest.announce,
      port: Number(opts.port),
      onProgress: (have, total) => process.stdout.write(`\r${have}/${total} pieces`),
    });
    node.once("complete", async (data: Buffer) => {
      await writeFile(output, data);
      console.log(`\nSaved ${output}`);
      await node.stop();
      // Deliberately not process.exit(): forcing an immediate exit right
      // after destroying sockets can race libuv's own handle teardown and
      // crash on Windows. Setting exitCode and letting the event loop
      // drain naturally exits cleanly once every handle has actually closed.
      process.exitCode = 0;
    });
    await node.start();
  });

program.parse();
