import { createHash } from "node:crypto";

/** BitTorrent's actual integrity guarantee: a file is split into fixed-size
 * pieces, each piece's SHA-1 hash is recorded up front in the manifest, and
 * every piece received from any peer - trusted or not - is re-hashed and
 * checked against that recorded value before it's ever accepted or written
 * to disk. A malicious or corrupt peer can send garbage; it just can't get
 * that garbage past the hash check. */

export function sha1(data: Buffer): Buffer {
  return createHash("sha1").update(data).digest();
}

/** Splits `data` into `pieceLength`-byte pieces (the final piece is
 * whatever remains, possibly shorter). */
export function splitIntoPieces(data: Buffer, pieceLength: number): Buffer[] {
  if (pieceLength <= 0) throw new Error("pieceLength must be positive");
  const pieces: Buffer[] = [];
  for (let offset = 0; offset < data.length; offset += pieceLength) {
    pieces.push(data.subarray(offset, Math.min(offset + pieceLength, data.length)));
  }
  // An empty file still has exactly one (empty) piece, matching how a
  // single-piece manifest for it is described.
  if (data.length === 0) pieces.push(Buffer.alloc(0));
  return pieces;
}

export function hashPieces(pieces: Buffer[]): Buffer[] {
  return pieces.map(sha1);
}

/** The real check: does this specific piece's content match the hash the
 * manifest promised for that piece index? */
export function verifyPiece(piece: Buffer, expectedHash: Buffer): boolean {
  return sha1(piece).equals(expectedHash);
}

export function pieceCount(totalLength: number, pieceLength: number): number {
  if (totalLength === 0) return 1;
  return Math.ceil(totalLength / pieceLength);
}

export function pieceLengthAt(index: number, totalLength: number, pieceLength: number): number {
  const start = index * pieceLength;
  return Math.max(0, Math.min(pieceLength, totalLength - start));
}
