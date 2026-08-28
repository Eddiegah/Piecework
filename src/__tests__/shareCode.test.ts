import { describe, it, expect } from "vitest";
import { generateShareCode, isValidShareCode } from "../shareCode.js";

describe("generateShareCode", () => {
  it("produces the adjective-noun-NN shape", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateShareCode()).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    }
  });

  it("produces reasonably varied codes, not the same one every time", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateShareCode()));
    expect(codes.size).toBeGreaterThan(50);
  });
});

describe("isValidShareCode", () => {
  it("accepts codes in the generated shape", () => {
    expect(isValidShareCode("swift-otter-42")).toBe(true);
    expect(isValidShareCode(generateShareCode())).toBe(true);
  });

  it("rejects malformed codes", () => {
    expect(isValidShareCode("")).toBe(false);
    expect(isValidShareCode("swift-otter")).toBe(false);
    expect(isValidShareCode("swift-otter-4")).toBe(false);
    expect(isValidShareCode("swift-otter-4200")).toBe(false);
    expect(isValidShareCode("Swift-Otter-42")).toBe(false);
    expect(isValidShareCode("swift_otter_42")).toBe(false);
    expect(isValidShareCode("../../../etc/passwd")).toBe(false);
    expect(isValidShareCode("swift-otter-42; DROP TABLE")).toBe(false);
  });
});
