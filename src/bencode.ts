/** Bencode: the actual serialization format BitTorrent uses for .torrent
 * files and tracker responses. Four types only - integers, byte strings,
 * lists, and dictionaries - which is why it's still easy to implement
 * correctly by hand decades later.
 *
 *   integers:     i<base-10 digits>e         e.g. i42e, i-3e
 *   byte strings: <length>:<raw bytes>        e.g. 4:spam
 *   lists:        l<bencoded items>e          e.g. l4:spam4:eggse
 *   dictionaries: d<key><value>...e           keys are byte strings,
 *                                              conventionally sorted
 *
 * Byte strings decode to `Buffer`, not `string` - bencode strings are raw
 * bytes (piece hashes are 20 raw bytes, not valid UTF-8), so forcing text
 * decoding at this layer would silently corrupt binary fields. Callers
 * call `.toString("utf8")` themselves when they know a field is text. */

export type BencodeValue = number | Buffer | BencodeValue[] | BencodeDict;
export interface BencodeDict {
  [key: string]: BencodeValue;
}

export function bencode(value: BencodeValue): Buffer {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error(`bencode integers must be whole numbers, got ${value}`);
    return Buffer.from(`i${value}e`, "ascii");
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([Buffer.from(`${value.length}:`, "ascii"), value]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from("l", "ascii"), ...value.map(bencode), Buffer.from("e", "ascii")]);
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts = keys.flatMap((k) => [bencode(Buffer.from(k, "utf8")), bencode(value[k])]);
    return Buffer.concat([Buffer.from("d", "ascii"), ...parts, Buffer.from("e", "ascii")]);
  }
  throw new Error(`cannot bencode value of type ${typeof value}`);
}

export function bdecode(buf: Buffer): BencodeValue {
  const [value, end] = decodeAt(buf, 0);
  if (end !== buf.length) throw new Error(`trailing bytes after bencoded value (used ${end} of ${buf.length})`);
  return value;
}

function decodeAt(buf: Buffer, pos: number): [BencodeValue, number] {
  const marker = buf[pos];
  if (marker === undefined) throw new Error("unexpected end of bencoded data");

  if (marker === 0x69 /* 'i' */) return decodeInt(buf, pos);
  if (marker === 0x6c /* 'l' */) return decodeList(buf, pos);
  if (marker === 0x64 /* 'd' */) return decodeDict(buf, pos);
  if (marker >= 0x30 && marker <= 0x39 /* '0'-'9' */) return decodeString(buf, pos);
  throw new Error(`invalid bencode marker '${String.fromCharCode(marker)}' at offset ${pos}`);
}

function decodeInt(buf: Buffer, pos: number): [number, number] {
  const end = buf.indexOf(0x65 /* 'e' */, pos);
  if (end === -1) throw new Error("unterminated integer");
  const text = buf.toString("ascii", pos + 1, end);
  if (!/^-?\d+$/.test(text)) throw new Error(`invalid integer literal "${text}"`);
  return [parseInt(text, 10), end + 1];
}

function decodeString(buf: Buffer, pos: number): [Buffer, number] {
  const colon = buf.indexOf(0x3a /* ':' */, pos);
  if (colon === -1) throw new Error("unterminated byte string length");
  const lengthText = buf.toString("ascii", pos, colon);
  const length = parseInt(lengthText, 10);
  if (!/^\d+$/.test(lengthText) || Number.isNaN(length)) throw new Error(`invalid string length "${lengthText}"`);
  const start = colon + 1;
  const end = start + length;
  if (end > buf.length) throw new Error("byte string runs past end of buffer");
  return [buf.subarray(start, end), end];
}

function decodeList(buf: Buffer, pos: number): [BencodeValue[], number] {
  const items: BencodeValue[] = [];
  let cursor = pos + 1;
  while (buf[cursor] !== 0x65 /* 'e' */) {
    const [item, next] = decodeAt(buf, cursor);
    items.push(item);
    cursor = next;
  }
  return [items, cursor + 1];
}

function decodeDict(buf: Buffer, pos: number): [BencodeDict, number] {
  const dict: BencodeDict = {};
  let cursor = pos + 1;
  while (buf[cursor] !== 0x65 /* 'e' */) {
    const [keyBuf, afterKey] = decodeString(buf, cursor);
    const [value, afterValue] = decodeAt(buf, afterKey);
    dict[keyBuf.toString("utf8")] = value;
    cursor = afterValue;
  }
  return [dict, cursor + 1];
}
