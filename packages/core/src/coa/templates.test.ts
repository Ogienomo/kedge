import { describe, expect, it } from "vitest";
import { SYSTEM_ACCOUNT_KEYS } from "../ledger/accounts";
import { COA_TEMPLATES, COA_TEMPLATE_KEYS, codeRangeFits, validateTemplate } from "./templates";

describe("chart of accounts templates", () => {
  it.each(COA_TEMPLATE_KEYS)("%s is structurally valid and has every system account once", (key) => {
    const t = COA_TEMPLATES[key];
    expect(validateTemplate(t.accounts, SYSTEM_ACCOUNT_KEYS)).toEqual([]);
  });

  it.each(COA_TEMPLATE_KEYS)("%s uses the SPEC §4.1 code ranges", (key) => {
    for (const acc of COA_TEMPLATES[key].accounts) expect({ code: acc.code, ok: codeRangeFits(acc.code, acc.subtype) }).toEqual({ code: acc.code, ok: true });
  });

  it.each(COA_TEMPLATE_KEYS)("%s has a bank account to post to", (key) => {
    expect(COA_TEMPLATES[key].accounts.some((x) => x.subtype === "bank")).toBe(true);
  });

  it("detects broken templates", () => {
    const problems = validateTemplate(
      [
        { code: "1000", name: "A", subtype: "bank", cashFlowCategory: null },
        { code: "4000", name: "B", subtype: "revenue", cashFlowCategory: "cash", parentCode: "1000" },
      ],
      ["suspense"],
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "System account suspense must appear exactly once",
        "1000: cash flow category is required on, and only on, balance sheet accounts",
        "4000: parent 1000 has a different type",
      ]),
    );
  });
});
