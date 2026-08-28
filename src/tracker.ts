import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { bencode } from "./bencode.js";

/** `info_hash` and `peer_id` are raw 20-byte values, not text - the real
 * BitTorrent tracker protocol percent-encodes every byte of them (mapping
 * each byte to its Latin-1 code point first) rather than treating them as
 * UTF-8 strings, because arbitrary binary bytes usually aren't valid UTF-8.
 * `URLSearchParams` decodes percent-encoded query values as UTF-8 and would
 * silently corrupt these two fields, so they're encoded/decoded by hand. */
export function encodeBytesParam(buf: Buffer): string {
  return encodeURIComponent(buf.toString("latin1"));
}

export function decodeBytesParam(raw: string): Buffer {
  return Buffer.from(decodeURIComponent(raw), "latin1");
}

function extractRawQueryValue(url: string, name: string): string | null {
  const qIndex = url.indexOf("?");
  if (qIndex === -1) return null;
  for (const pair of url.substring(qIndex + 1).split("&")) {
    const eq = pair.indexOf("=");
    const key = eq === -1 ? pair : pair.substring(0, eq);
    if (key === name) return eq === -1 ? "" : pair.substring(eq + 1);
  }
  return null;
}

export interface AnnouncedPeer {
  peerId: Buffer;
  ip: string;
  port: number;
}

export interface AnnounceRequest {
  infoHash: Buffer;
  peerId: Buffer;
  port: number;
  event?: "started" | "stopped" | "completed";
}

/** Builds the query string a peer sends to announce itself, matching the
 * real tracker announce request shape (a subset of it - uploaded/downloaded
 * /left/compact are the well-known fields this demo doesn't need). */
export function buildAnnounceUrl(trackerUrl: string, req: AnnounceRequest): string {
  const params = [
    `info_hash=${encodeBytesParam(req.infoHash)}`,
    `peer_id=${encodeBytesParam(req.peerId)}`,
    `port=${req.port}`,
  ];
  if (req.event) params.push(`event=${req.event}`);
  return `${trackerUrl}?${params.join("&")}`;
}

/** A minimal but protocol-faithful HTTP tracker: peers announce themselves
 * per info_hash, and get back a bencoded list of the other peers currently
 * in that same swarm - the tracker itself never touches file data, it only
 * ever does peer discovery. */
export class Tracker {
  private readonly swarms = new Map<string, Map<string, AnnouncedPeer>>();
  private readonly server: Server;
  private port = 0;

  constructor() {
    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  listen(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "127.0.0.1", () => {
        const address = this.server.address();
        this.port = typeof address === "object" && address ? address.port : port;
        resolve(this.port);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/announce`;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";
    if (!url.startsWith("/announce")) {
      res.writeHead(404);
      res.end();
      return;
    }

    const infoHashRaw = extractRawQueryValue(url, "info_hash");
    const peerIdRaw = extractRawQueryValue(url, "peer_id");
    const params = new URL(url, "http://127.0.0.1");
    const port = Number(params.searchParams.get("port"));
    const event = params.searchParams.get("event");

    if (!infoHashRaw || !peerIdRaw || !Number.isFinite(port)) {
      res.writeHead(400);
      res.end(bencode({ "failure reason": Buffer.from("missing required announce parameters") }));
      return;
    }

    const infoHash = decodeBytesParam(infoHashRaw);
    const peerId = decodeBytesParam(peerIdRaw);
    const swarmKey = infoHash.toString("hex");
    const peerKey = peerId.toString("hex");
    if (!this.swarms.has(swarmKey)) this.swarms.set(swarmKey, new Map());
    const swarm = this.swarms.get(swarmKey)!;

    const ip = (req.socket.remoteAddress ?? "127.0.0.1").replace("::ffff:", "");

    if (event === "stopped") {
      swarm.delete(peerKey);
    } else {
      swarm.set(peerKey, { peerId, ip, port });
    }

    const peers = [...swarm.values()].filter((p) => p.peerId.toString("hex") !== peerKey);

    const body = bencode({
      interval: 30,
      peers: peers.map((p) => ({ "peer id": p.peerId, ip: Buffer.from(p.ip, "utf8"), port: p.port })),
    });
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(body);
  }
}
