import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/e/123/dashboard?x=1")).toBe("/e/123/dashboard?x=1");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined])("rejects %s", (next) => {
    expect(safeNext(next)).toBe("/");
  });
});
