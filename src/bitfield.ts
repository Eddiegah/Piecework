/** A bit-packed "which pieces do I have" record, in the same layout
 * BitTorrent's own bitfield wire message uses: piece 0 is the high bit of
 * byte 0, piece 8 is the high bit of byte 1, and so on. */

export function createBitfield(pieceCount: number): Buffer {
  return Buffer.alloc(Math.ceil(pieceCount / 8));
}

export function setBit(bitfield: Buffer, index: number): void {
  bitfield[index >> 3] |= 0x80 >> (index & 7);
}

export function hasBit(bitfield: Buffer, index: number): boolean {
  return (bitfield[index >> 3] & (0x80 >> (index & 7))) !== 0;
}

export function countSetBits(bitfield: Buffer, pieceCount: number): number {
  let count = 0;
  for (let i = 0; i < pieceCount; i++) if (hasBit(bitfield, i)) count++;
  return count;
}

export function isComplete(bitfield: Buffer, pieceCount: number): boolean {
  return countSetBits(bitfield, pieceCount) === pieceCount;
}

export function missingPieces(bitfield: Buffer, pieceCount: number): number[] {
  const missing: number[] = [];
  for (let i = 0; i < pieceCount; i++) if (!hasBit(bitfield, i)) missing.push(i);
  return missing;
}
