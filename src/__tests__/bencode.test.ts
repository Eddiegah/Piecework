import { describe, it, expect } from "vitest";
import { bencode, bdecode, BencodeValue } from "../bencode.js";

describe("bencode", () => {
  it("encodes integers per spec", () => {
    expect(bencode(42).toString("ascii")).toBe("i42e");
    expect(bencode(-3).toString("ascii")).toBe("i-3e");
    expect(bencode(0).toString("ascii")).toBe("i0e");
  });

  it("encodes byte strings per spec", () => {
    expect(bencode(Buffer.from("spam")).toString("ascii")).toBe("4:spam");
    expect(bencode(Buffer.alloc(0)).toString("ascii")).toBe("0:");
  });

  it("encodes lists per spec", () => {
    expect(bencode([Buffer.from("spam"), Buffer.from("eggs")]).toString("ascii")).toBe("l4:spam4:eggse");
  });

  it("encodes dictionaries with sorted keys per spec", () => {
    const dict = { spam: Buffer.from("eggs"), cow: Buffer.from("moo") };
    expect(bencode(dict).toString("ascii")).toBe("d3:cow3:moo4:spam4:eggse");
  });

  it("rejects non-integer numbers", () => {
    expect(() => bencode(1.5)).toThrow();
  });

  it("round-trips a realistic nested structure", () => {
    const value: BencodeValue = {
      announce: Buffer.from("http://tracker.example/announce"),
      info: {
        name: Buffer.from("file.bin"),
        "piece length": 16384,
        length: 50000,
        pieces: Buffer.from("a".repeat(40)),
      },
    };
    const decoded = bdecode(bencode(value));
    expect(bencode(decoded)).toEqual(bencode(value));
  });

  it("round-trips negative and large integers", () => {
    for (const n of [-1, 0, 1, 255, 65536, -999999]) {
      expect(bdecode(bencode(n))).toBe(n);
    }
  });

  it("round-trips arbitrary binary byte strings, not just text", () => {
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0x9a, 0x00, 0x00]);
    expect(bdecode(bencode(bytes))).toEqual(bytes);
  });

  it("rejects trailing garbage after a complete value", () => {
    const valid = bencode(42);
    const withGarbage = Buffer.concat([valid, Buffer.from("xyz")]);
    expect(() => bdecode(withGarbage)).toThrow();
  });

  it("rejects truncated input", () => {
    expect(() => bdecode(Buffer.from("4:sp"))).toThrow();
    expect(() => bdecode(Buffer.from("i42"))).toThrow();
    expect(() => bdecode(Buffer.from("l4:spam"))).toThrow();
  });

  it("matches the canonical bencode spec examples", () => {
    // These are the exact examples from the original BitTorrent spec.
    expect(bdecode(Buffer.from("i3e"))).toBe(3);
    expect(bdecode(Buffer.from("4:spam"))).toEqual(Buffer.from("spam"));
    expect(bdecode(Buffer.from("l4:spam4:eggse"))).toEqual([Buffer.from("spam"), Buffer.from("eggs")]);
    expect(bdecode(Buffer.from("d3:cow3:moo4:spam4:eggse"))).toEqual({
      cow: Buffer.from("moo"),
      spam: Buffer.from("eggs"),
    });
  });
});
