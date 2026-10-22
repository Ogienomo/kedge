import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";
import { add, money, parseAmountInput, parseMinor, roundMinor } from "./money";
import { splitInclusive, taxOnNet } from "./tax-math";

describe("roundMinor (half away from zero)", () => {
  it.each([
    [5n, 2n, 3n],
    [-5n, 2n, -3n],
    [4n, 2n, 2n],
    [7n, 3n, 2n],
    [-7n, 3n, -2n],
    [8n, 3n, 3n],
    [1n, -2n, -1n],
    [0n, 9n, 0n],
  ])("%s / %s = %s", (n, d, expected) => {
    expect(roundMinor(n, d)).toBe(expected);
  });

  it("is within half a unit of the exact quotient, symmetric in sign", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), fc.bigInt({ min: 1n, max: 10n ** 6n }), (n, d) => {
        const r = roundMinor(n, d);
        const diff2 = (r * d - n) * 2n; // 2·(r − n/d)·d
        return diff2 <= d && diff2 >= -d && roundMinor(-n, d) === -r;
      }),
    );
  });
});

describe("VAT-inclusive split (SPEC §4.4)", () => {
  it("splits ₦10,750.00 at 7.5% into ₦10,000.00 + ₦750.00", () => {
    expect(splitInclusive(1_075_000n, 750)).toEqual({ net: 1_000_000n, tax: 75_000n });
  });

  it("rounds the net half away from zero and gives the residue to tax", () => {
    // 100 × 10000 / 10750 = 93.0232… → 93; tax 7
    expect(splitInclusive(100n, 750)).toEqual({ net: 93n, tax: 7n });
  });

  it("always reassembles to the gross exactly", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 14n }), fc.integer({ min: 0, max: 10_000 }), (gross, rate) => {
        const { net, tax } = splitInclusive(gross, rate);
        return net + tax === gross && net >= 0n && tax >= 0n;
      }),
    );
  });

  it("computes tax on net", () => {
    expect(taxOnNet(1_000_000n, 750)).toBe(75_000n);
    expect(taxOnNet(333n, 500)).toBe(17n); // 16.65 → 17
  });

  it("rejects fractional or out-of-range rates", () => {
    expect(() => splitInclusive(100n, 7.5)).toThrow(RangeError);
    expect(() => taxOnNet(100n, -1)).toThrow(RangeError);
  });
});

describe("parsing and formatting", () => {
  it("parses the API wire format strictly", () => {
    expect(parseMinor("123456")).toBe(123456n);
    expect(parseMinor("-5")).toBe(-5n);
    for (const bad of ["1.5", "", "01", "-0", "1e3", " 1"]) expect(() => parseMinor(bad)).toThrow();
  });

  it.each([
    ["1,234.56", 123456n],
    ["₦ 1 234.5", 123450n],
    ["20", 2000n],
    ["(12,500.00)", -1250000n],
    ["0.07", 7n],
  ])("parses user input %s", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(["1.234", "abc", "1..2", ""])("rejects user input %s", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });

  it.each([
    [123456789n, {}, "₦1,234,567.89"],
    [-1250000n, { negative: "parentheses" as const }, "(₦12,500.00)"],
    [-5n, {}, "-₦0.05"],
    [0n, {}, "₦0.00"],
    [123456789n, { thousands: true, symbol: false }, "1,235"],
    [-49_999n, { thousands: true, negative: "parentheses" as const }, "₦0"],
  ])("formats %s", (minor, opts, expected) => {
    expect(formatMoney(minor, "NGN", opts)).toBe(expected);
  });

  it("round-trips any amount through format and parse", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 16n), max: 10n ** 16n }), (m) => parseAmountInput(formatMoney(m, "NGN", { negative: "parentheses" })) === m),
    );
  });

  it("refuses to mix currencies", () => {
    expect(() => add(money(1n, "NGN"), money(1n, "USD"))).toThrow(/Cannot combine/);
  });
});
