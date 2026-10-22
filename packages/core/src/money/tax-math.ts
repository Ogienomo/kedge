import { roundMinor } from "./money";

/** Basis points per whole: 10000 bps = 100%. Rates are integers (750 = 7.5%). */
export const BPS = 10_000n;

export function assertRateBps(rateBps: number): bigint {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) throw new RangeError(`Invalid rate: ${rateBps} bps`);
  return BigInt(rateBps);
}

/**
 * Splits a tax-inclusive amount (SPEC §4.4):
 * net = round(gross × 10000 / (10000 + rate)), tax = gross − net.
 */
export function splitInclusive(gross: bigint, rateBps: number): { net: bigint; tax: bigint } {
  const rate = assertRateBps(rateBps);
  const net = roundMinor(gross * BPS, BPS + rate);
  return { net, tax: gross - net };
}

/** Tax charged on a net amount: round(net × rate / 10000). */
export function taxOnNet(net: bigint, rateBps: number): bigint {
  return roundMinor(net * assertRateBps(rateBps), BPS);
}
