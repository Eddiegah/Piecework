import { Socket, createConnection } from "node:net";
import { EventEmitter } from "node:events";
import { Handshake, WireMessage, encodeHandshake, encodeMessage, tryDecodeHandshake, tryDecodeMessage } from "./wireProtocol.js";

/** Wraps a raw TCP socket with the peer wire protocol's framing: buffers
 * incoming bytes across as many `data` events as it takes, decodes the
 * one-time handshake, then decodes zero or more complete messages out of
 * whatever's left - emitting each as a "handshake" or "message" event.
 * Nothing here assumes a message arrives in a single read. */
export class PeerConnection extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private handshakeReceived = false;

  constructor(private readonly socket: Socket) {
    super();
    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("close", () => this.emit("close"));
    socket.on("error", (err: Error) => this.emit("error", err));
  }

  static connect(host: string, port: number): PeerConnection {
    return new PeerConnection(createConnection({ host, port }));
  }

  get remoteAddress(): string | undefined {
    return this.socket.remoteAddress;
  }

  sendHandshake(h: Handshake): void {
    this.socket.write(encodeHandshake(h));
  }

  sendMessage(msg: WireMessage): void {
    this.socket.write(encodeMessage(msg));
  }

  destroy(): void {
    this.socket.destroy();
  }

  private onData(chunk: Buffer): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    if (!this.handshakeReceived) {
      const result = tryDecodeHandshake(this.buffer);
      if (!result) return; // wait for the rest of the handshake
      this.handshakeReceived = true;
      this.buffer = this.buffer.subarray(result.consumed);
      this.emit("handshake", result.handshake);
    }

    for (;;) {
      const result = tryDecodeMessage(this.buffer);
      if (!result) break;
      this.buffer = this.buffer.subarray(result.consumed);
      this.emit("message", result.message);
    }
  }

  onHandshake(listener: (h: Handshake) => void): this {
    return this.on("handshake", listener);
  }

  onMessage(listener: (m: WireMessage) => void): this {
    return this.on("message", listener);
  }

  onClose(listener: () => void): this {
    return this.on("close", listener);
  }

  onError(listener: (err: Error) => void): this {
    return this.on("error", listener);
  }
}
