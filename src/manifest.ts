import { BencodeDict, bencode, bdecode } from "./bencode.js";
import { hashPieces, pieceCount, sha1, splitIntoPieces } from "./pieces.js";

export interface TorrentInfo {
  name: string;
  pieceLength: number;
  length: number;
  /** One 20-byte SHA-1 hash per piece, in order. */
  pieces: Buffer[];
}

export interface Manifest {
  announce: string;
  info: TorrentInfo;
}

/** Builds a manifest for `data`, splitting it into pieces and hashing each
 * one up front - this is the "planning" step; the hashes recorded here are
 * what every downloaded piece gets checked against later, from any peer. */
export function createManifest(data: Buffer, name: string, pieceLength: number, announce: string): Manifest {
  const pieces = hashPieces(splitIntoPieces(data, pieceLength));
  return { announce, info: { name, pieceLength, length: data.length, pieces } };
}

/** The real BitTorrent scheme: an info_hash isn't a random ID, it's the
 * SHA-1 of the exact bencoded `info` dict - so two manifests describing the
 * identical file with identical piece boundaries always produce the
 * identical info_hash, which is what lets independently-created torrents
 * for "the same" file interoperate at all. */
export function infoHash(info: TorrentInfo): Buffer {
  return sha1(bencode(infoToBencodeDict(info)));
}

function infoToBencodeDict(info: TorrentInfo): BencodeDict {
  return {
    name: Buffer.from(info.name, "utf8"),
    "piece length": info.pieceLength,
    length: info.length,
    pieces: Buffer.concat(info.pieces),
  };
}

export function encodeManifest(manifest: Manifest): Buffer {
  return bencode({
    announce: Buffer.from(manifest.announce, "utf8"),
    info: infoToBencodeDict(manifest.info),
  });
}

export function decodeManifest(buf: Buffer): Manifest {
  const top = bdecode(buf);
  if (typeof top !== "object" || Buffer.isBuffer(top) || Array.isArray(top)) {
    throw new Error("manifest root must be a dictionary");
  }
  const announceRaw = top.announce;
  const infoRaw = top.info;
  if (!Buffer.isBuffer(announceRaw)) throw new Error("manifest missing 'announce'");
  if (typeof infoRaw !== "object" || Buffer.isBuffer(infoRaw) || Array.isArray(infoRaw)) {
    throw new Error("manifest missing 'info' dictionary");
  }

  const nameRaw = infoRaw.name;
  const pieceLengthRaw = infoRaw["piece length"];
  const lengthRaw = infoRaw.length;
  const piecesRaw = infoRaw.pieces;
  if (!Buffer.isBuffer(nameRaw)) throw new Error("info.name must be a byte string");
  if (typeof pieceLengthRaw !== "number") throw new Error("info['piece length'] must be an integer");
  if (typeof lengthRaw !== "number") throw new Error("info.length must be an integer");
  if (!Buffer.isBuffer(piecesRaw)) throw new Error("info.pieces must be a byte string");
  if (piecesRaw.length % 20 !== 0) throw new Error(`info.pieces length ${piecesRaw.length} is not a multiple of 20`);

  const expectedCount = pieceCount(lengthRaw, pieceLengthRaw);
  const actualCount = piecesRaw.length / 20;
  if (actualCount !== expectedCount) {
    throw new Error(`info.pieces has ${actualCount} hashes, expected ${expectedCount} for a ${lengthRaw}-byte file`);
  }

  const pieces: Buffer[] = [];
  for (let i = 0; i < actualCount; i++) pieces.push(piecesRaw.subarray(i * 20, i * 20 + 20));

  return {
    announce: announceRaw.toString("utf8"),
    info: { name: nameRaw.toString("utf8"), pieceLength: pieceLengthRaw, length: lengthRaw, pieces },
  };
}
