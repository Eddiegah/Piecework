/** The real BitTorrent peer wire protocol (BEP 3): a one-time handshake,
 * then a stream of length-prefixed messages. TCP delivers a byte stream,
 * not discrete packets, so a socket's `data` event can hand you half a
 * message, one message, or three messages stuck together - every function
 * here is written around that reality rather than assuming clean framing. */

const PROTOCOL_NAME = "BitTorrent protocol";
export const PEER_ID_LENGTH = 20;
export const INFO_HASH_LENGTH = 20;

export interface Handshake {
  infoHash: Buffer;
  peerId: Buffer;
}

export function encodeHandshake(h: Handshake): Buffer {
  if (h.infoHash.length !== INFO_HASH_LENGTH) throw new Error("infoHash must be 20 bytes");
  if (h.peerId.length !== PEER_ID_LENGTH) throw new Error("peerId must be 20 bytes");
  const pstr = Buffer.from(PROTOCOL_NAME, "ascii");
  return Buffer.concat([Buffer.from([pstr.length]), pstr, Buffer.alloc(8), h.infoHash, h.peerId]);
}

export function handshakeLength(): number {
  return 1 + PROTOCOL_NAME.length + 8 + INFO_HASH_LENGTH + PEER_ID_LENGTH;
}

/** Returns null if `buf` doesn't yet hold a complete handshake. */
export function tryDecodeHandshake(buf: Buffer): { handshake: Handshake; consumed: number } | null {
  if (buf.length < 1) return null;
  const pstrlen = buf.readUInt8(0);
  const total = 1 + pstrlen + 8 + INFO_HASH_LENGTH + PEER_ID_LENGTH;
  if (buf.length < total) return null;
  const infoHashStart = 1 + pstrlen + 8;
  const infoHash = Buffer.from(buf.subarray(infoHashStart, infoHashStart + INFO_HASH_LENGTH));
  const peerId = Buffer.from(buf.subarray(infoHashStart + INFO_HASH_LENGTH, total));
  return { handshake: { infoHash, peerId }, consumed: total };
}

export type WireMessage =
  | { type: "keep-alive" }
  | { type: "choke" }
  | { type: "unchoke" }
  | { type: "interested" }
  | { type: "not-interested" }
  | { type: "have"; index: number }
  | { type: "bitfield"; bitfield: Buffer }
  | { type: "request"; index: number; begin: number; length: number }
  | { type: "piece"; index: number; begin: number; block: Buffer }
  | { type: "cancel"; index: number; begin: number; length: number };

const MESSAGE_ID = {
  choke: 0,
  unchoke: 1,
  interested: 2,
  "not-interested": 3,
  have: 4,
  bitfield: 5,
  request: 6,
  piece: 7,
  cancel: 8,
} as const;

export function encodeMessage(msg: WireMessage): Buffer {
  if (msg.type === "keep-alive") return Buffer.alloc(4); // length prefix 0, no id/payload

  let payload: Buffer;
  switch (msg.type) {
    case "choke":
    case "unchoke":
    case "interested":
    case "not-interested":
      payload = Buffer.alloc(0);
      break;
    case "have":
      payload = uint32(msg.index);
      break;
    case "bitfield":
      payload = msg.bitfield;
      break;
    case "request":
    case "cancel":
      payload = Buffer.concat([uint32(msg.index), uint32(msg.begin), uint32(msg.length)]);
      break;
    case "piece":
      payload = Buffer.concat([uint32(msg.index), uint32(msg.begin), msg.block]);
      break;
  }

  const id = MESSAGE_ID[msg.type];
  const length = 1 + payload.length;
  const out = Buffer.alloc(4 + length);
  out.writeUInt32BE(length, 0);
  out.writeUInt8(id, 4);
  payload.copy(out, 5);
  return out;
}

/** Attempts to decode ONE complete length-prefixed message from the front
 * of `buf`. Returns null if `buf` doesn't yet contain a full message - the
 * caller keeps buffering socket data and retrying until it does. */
export function tryDecodeMessage(buf: Buffer): { message: WireMessage; consumed: number } | null {
  if (buf.length < 4) return null;
  const length = buf.readUInt32BE(0);
  if (buf.length < 4 + length) return null;
  const consumed = 4 + length;
  if (length === 0) return { message: { type: "keep-alive" }, consumed };

  const id = buf.readUInt8(4);
  const payload = buf.subarray(5, consumed);
  return { message: decodePayload(id, payload), consumed };
}

function decodePayload(id: number, payload: Buffer): WireMessage {
  switch (id) {
    case MESSAGE_ID.choke:
      return { type: "choke" };
    case MESSAGE_ID.unchoke:
      return { type: "unchoke" };
    case MESSAGE_ID.interested:
      return { type: "interested" };
    case MESSAGE_ID["not-interested"]:
      return { type: "not-interested" };
    case MESSAGE_ID.have:
      return { type: "have", index: payload.readUInt32BE(0) };
    case MESSAGE_ID.bitfield:
      return { type: "bitfield", bitfield: Buffer.from(payload) };
    case MESSAGE_ID.request:
      return { type: "request", index: payload.readUInt32BE(0), begin: payload.readUInt32BE(4), length: payload.readUInt32BE(8) };
    case MESSAGE_ID.piece:
      return { type: "piece", index: payload.readUInt32BE(0), begin: payload.readUInt32BE(4), block: Buffer.from(payload.subarray(8)) };
    case MESSAGE_ID.cancel:
      return { type: "cancel", index: payload.readUInt32BE(0), begin: payload.readUInt32BE(4), length: payload.readUInt32BE(8) };
    default:
      throw new Error(`unknown wire message id ${id}`);
  }
}

function uint32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}
