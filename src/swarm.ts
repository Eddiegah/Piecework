import { createServer, Server, Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { Manifest } from "./manifest.js";
import { infoHash as computeInfoHash } from "./manifest.js";
import { PeerConnection } from "./peerConnection.js";
import { announce } from "./trackerClient.js";
import { AnnouncedPeer } from "./tracker.js";
import { createBitfield, hasBit, isComplete, missingPieces, setBit } from "./bitfield.js";
import { pieceLengthAt, verifyPiece } from "./pieces.js";
import { PEER_ID_LENGTH } from "./wireProtocol.js";

export interface PeerNodeOptions {
  manifest: Manifest;
  trackerUrl: string;
  /** Own TCP listening port - other peers connect here to trade pieces.
   * Omit or pass 0 to let the OS pick a free port automatically. */
  port?: number;
  /** Interface to listen on. Defaults to every interface ("0.0.0.0"), so
   * peers on the same network - not just the same machine - can actually
   * reach this node. Pass "127.0.0.1" to restrict to localhost-only. */
  host?: string;
  /** If provided, this node starts as a complete seeder with this exact
   * file data (its hash MUST match the manifest). If omitted, it starts
   * empty, as a leecher with nothing to serve yet. */
  seedData?: Buffer;
  onProgress?: (have: number, total: number) => void;
}

interface PeerState {
  conn: PeerConnection;
  bitfield: Buffer;
  peerChoking: boolean; // are THEY choking US
  amInterested: boolean;
}

/** One full peer: it seeds whatever pieces it has, downloads whatever it's
 * missing from anyone who has them, and verifies every single received
 * piece against the manifest's recorded hash before ever accepting it -
 * exactly the same trust model real BitTorrent uses (the swarm is
 * adversarial by default; only the hash is trusted). */
export class PeerNode extends EventEmitter {
  readonly peerId: Buffer = randomBytes(PEER_ID_LENGTH);
  readonly infoHash: Buffer;
  private readonly pieces: (Buffer | null)[];
  private readonly bitfield: Buffer;
  private readonly peers = new Map<string, PeerState>();
  private server: Server | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private listeningPort = 0;

  constructor(private readonly opts: PeerNodeOptions) {
    super();
    this.infoHash = computeInfoHash(opts.manifest.info);
    this.pieces = new Array(opts.manifest.info.pieces.length).fill(null);
    this.bitfield = createBitfield(opts.manifest.info.pieces.length);

    if (opts.seedData) {
      const { pieceLength, length } = opts.manifest.info;
      for (let i = 0; i < this.pieces.length; i++) {
        const start = i * pieceLength;
        const piece = opts.seedData.subarray(start, start + pieceLengthAt(i, length, pieceLength));
        if (!verifyPiece(piece, opts.manifest.info.pieces[i])) {
          throw new Error(`seedData piece ${i} does not match the manifest's recorded hash`);
        }
        this.pieces[i] = Buffer.from(piece);
        setBit(this.bitfield, i);
      }
    }
  }

  /** The actual port this node ended up listening on - only meaningful
   * after start() resolves. Equal to opts.port unless it was 0/omitted,
   * in which case this is whatever free port the OS assigned. */
  get port(): number {
    return this.listeningPort;
  }

  get pieceCount(): number {
    return this.pieces.length;
  }

  get haveCount(): number {
    return this.pieces.filter((p) => p !== null).length;
  }

  get isComplete(): boolean {
    return isComplete(this.bitfield, this.pieces.length);
  }

  /** The reassembled file, once every piece has arrived and verified -
   * throws if called before completion. */
  get fileData(): Buffer {
    if (!this.isComplete) throw new Error("cannot read fileData: transfer is not complete");
    return Buffer.concat(this.pieces.map((p) => p!));
  }

  async start(): Promise<void> {
    await this.listen();
    await this.announceAndConnect("started");
    this.announceTimer = setInterval(() => {
      this.announceAndConnect().catch((err) => this.emit("error", err));
    }, 5000);
  }

  async stop(): Promise<void> {
    if (this.announceTimer) clearInterval(this.announceTimer);
    for (const peer of this.peers.values()) peer.conn.destroy();
    this.peers.clear();
    await announce(this.opts.trackerUrl, {
      infoHash: this.infoHash,
      peerId: this.peerId,
      port: this.listeningPort,
      event: "stopped",
    }).catch(() => {});
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.acceptIncoming(socket));
      this.server.once("error", reject);
      this.server.listen(this.opts.port ?? 0, this.opts.host ?? "0.0.0.0", () => {
        const address = this.server!.address();
        this.listeningPort = typeof address === "object" && address ? address.port : (this.opts.port ?? 0);
        resolve();
      });
    });
  }

  private async announceAndConnect(event?: "started" | "stopped" | "completed"): Promise<void> {
    const peers = await announce(this.opts.trackerUrl, {
      infoHash: this.infoHash,
      peerId: this.peerId,
      port: this.listeningPort,
      event,
    });
    for (const peer of peers) this.connectToPeer(peer);
  }

  private connectToPeer(peer: AnnouncedPeer): void {
    const key = `${peer.ip}:${peer.port}`;
    if (this.peers.has(key)) return;
    const conn = PeerConnection.connect(peer.ip, peer.port);
    this.setupConnection(conn, key);
  }

  private acceptIncoming(socket: Socket): void {
    const key = `${socket.remoteAddress}:${socket.remotePort}`;
    const conn = new PeerConnection(socket);
    this.setupConnection(conn, key, /* incoming */ true);
  }

  private setupConnection(conn: PeerConnection, key: string, incoming = false): void {
    const state: PeerState = { conn, bitfield: createBitfield(this.pieces.length), peerChoking: true, amInterested: false };
    this.peers.set(key, state);

    if (!incoming) conn.sendHandshake({ infoHash: this.infoHash, peerId: this.peerId });

    conn.onHandshake((h) => {
      if (!h.infoHash.equals(this.infoHash)) {
        conn.destroy();
        return;
      }
      if (incoming) conn.sendHandshake({ infoHash: this.infoHash, peerId: this.peerId });
      conn.sendMessage({ type: "bitfield", bitfield: this.bitfield });
      conn.sendMessage({ type: "unchoke" }); // demo-scale swarm: no choking policy needed
    });

    conn.onMessage((msg) => this.onPeerMessage(key, state, msg));
    conn.onClose(() => this.peers.delete(key));
    conn.onError(() => this.peers.delete(key));
  }

  private onPeerMessage(key: string, state: PeerState, msg: import("./wireProtocol.js").WireMessage): void {
    switch (msg.type) {
      case "bitfield":
        state.bitfield = msg.bitfield;
        this.maybeRequestFrom(state);
        break;
      case "have":
        setBit(state.bitfield, msg.index);
        this.maybeRequestFrom(state);
        break;
      case "unchoke":
        state.peerChoking = false;
        this.maybeRequestFrom(state);
        break;
      case "choke":
        state.peerChoking = true;
        break;
      case "interested":
        state.conn.sendMessage({ type: "unchoke" });
        break;
      case "request": {
        const piece = this.pieces[msg.index];
        if (piece) state.conn.sendMessage({ type: "piece", index: msg.index, begin: 0, block: piece });
        break;
      }
      case "piece":
        this.onPieceReceived(msg.index, msg.block);
        this.maybeRequestFrom(state);
        break;
      default:
        break;
    }
  }

  private onPieceReceived(index: number, block: Buffer): void {
    if (this.pieces[index]) return; // already have it, verified, from someone else
    if (!verifyPiece(block, this.opts.manifest.info.pieces[index])) {
      this.emit("badPiece", index);
      return; // reject silently and just try again from another peer later
    }
    this.pieces[index] = block;
    setBit(this.bitfield, index);
    this.opts.onProgress?.(this.haveCount, this.pieceCount);

    for (const peer of this.peers.values()) peer.conn.sendMessage({ type: "have", index });

    if (this.isComplete) this.emit("complete", this.fileData);
  }

  /** Simplified piece selection: ask this peer for the first piece it has
   * that we're missing and haven't already asked someone else for. Real
   * clients use rarest-first selection and pipeline several in-flight
   * block requests at once; at demo scale (a handful of peers, small
   * files) this is correct and more than fast enough. */
  private maybeRequestFrom(state: PeerState): void {
    if (state.peerChoking) return;
    const missing = missingPieces(this.bitfield, this.pieces.length);
    const target = missing.find((i) => hasBit(state.bitfield, i));
    if (target === undefined) return;
    const length = pieceLengthAt(target, this.opts.manifest.info.length, this.opts.manifest.info.pieceLength);
    state.conn.sendMessage({ type: "request", index: target, begin: 0, length });
  }
}
