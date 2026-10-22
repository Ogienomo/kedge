import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, dateInTimezone, daysBetween } from "./dates";
import { assertCanUnlock, assertDateInPostablePeriod, fiscalYearContaining, fiscalYearLabel, monthlyPeriods, openingBalanceDate, reversalDate, type PeriodInfo } from "./periods";

describe("fiscal years and periods", () => {
  it("January start gives the calendar year", () => {
    expect(fiscalYearContaining("2026-10-22", 1)).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });

  it("April start spans two calendar years", () => {
    expect(fiscalYearContaining("2026-02-10", 4)).toEqual({ startDate: "2025-04-01", endDate: "2026-03-31" });
    expect(fiscalYearContaining("2026-04-01", 4)).toEqual({ startDate: "2026-04-01", endDate: "2027-03-31" });
    expect(fiscalYearLabel(fiscalYearContaining("2026-04-01", 4))).toBe("2027");
  });

  it("splits into twelve contiguous months with correct month ends", () => {
    const periods = monthlyPeriods(fiscalYearContaining("2028-06-01", 1));
    expect(periods).toHaveLength(12);
    expect(periods[1]).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    for (let i = 1; i < 12; i++) expect(addDays(periods[i - 1]?.endDate ?? "", 1)).toBe(periods[i]?.startDate);
  });

  it("every date belongs to exactly one period of its fiscal year", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2000-01-01"), max: new Date("2099-12-31"), noInvalidDate: true }), fc.integer({ min: 1, max: 12 }), (d, start) => {
        const iso = d.toISOString().slice(0, 10);
        const fy = fiscalYearContaining(iso, start);
        return monthlyPeriods(fy).filter((p) => iso >= p.startDate && iso <= p.endDate).length === 1;
      }),
    );
  });
});

describe("dates", () => {
  it("adds days across month and leap-year boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
  });

  it("uses the entity timezone for today's date (rule 11)", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Lagos (UTC+1).
    expect(dateInTimezone(new Date("2025-12-31T23:30:00Z"), "Africa/Lagos")).toBe("2026-01-01");
    expect(dateInTimezone(new Date("2025-12-31T23:30:00Z"), "UTC")).toBe("2025-12-31");
  });

  it("opening balances post the day before go-live", () => {
    expect(openingBalanceDate("2026-01-01")).toBe("2025-12-31");
  });
});

describe("period locks (rule 5)", () => {
  const periods: PeriodInfo[] = [
    { id: "jan", startDate: "2026-01-01", endDate: "2026-01-31", status: "closed" },
    { id: "feb", startDate: "2026-02-01", endDate: "2026-02-28", status: "locked" },
    { id: "mar", startDate: "2026-03-01", endDate: "2026-03-31", status: "open" },
  ];

  it("refuses locked, closed and missing periods", () => {
    expect(() => assertDateInPostablePeriod("2026-02-10", periods[1] ?? null)).toThrowError(expect.objectContaining({ code: "period_locked" }));
    expect(() => assertDateInPostablePeriod("2026-01-10", periods[0] ?? null)).toThrowError(expect.objectContaining({ code: "period_locked" }));
    expect(() => assertDateInPostablePeriod("2026-04-01", null)).toThrowError(expect.objectContaining({ code: "period_not_found" }));
    expect(() => assertDateInPostablePeriod("2026-04-01", periods[2] ?? null)).toThrowError(expect.objectContaining({ code: "period_not_found" }));
    expect(() => assertDateInPostablePeriod("2026-03-31", periods[2] ?? null)).not.toThrow();
  });

  it("dates reversals of locked-period entries on the first open date", () => {
    expect(reversalDate("2026-02-10", periods)).toBe("2026-03-01");
    expect(reversalDate("2026-03-15", periods)).toBe("2026-03-15");
  });

  it("unlocking needs a locked period and a reason", () => {
    expect(() => assertCanUnlock(periods[1] as PeriodInfo, "  ")).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() => assertCanUnlock(periods[0] as PeriodInfo, "fix")).toThrowError(expect.objectContaining({ code: "period_status" }));
    expect(() => assertCanUnlock(periods[1] as PeriodInfo, "Late supplier invoice")).not.toThrow();
  });
});
