/**
 * Phase 1 journeys (CLAUDE.md e2e list): onboarding, quick-add transaction,
 * period lock and report export, at 360 px and 1440 px.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { completeSetupWizard, expectNoHorizontalScroll, signUp, uniqueEmail } from "./support";

async function quickAdd(page: Page, amount: string) {
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "Record something" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Money in" }).click();
  await dialog.getByLabel("Amount (₦)").fill(amount);
  await dialog.getByLabel("Category").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Record" }).click();
  return dialog;
}

test("a business owner sets up books, records money in, locks the month and exports reports", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("ledger"), name: "Adaeze Nwosu", orgName: "Adaeze Catering Ltd", kind: "business" });
  await page.getByRole("button", { name: "Continue" }).click();

  // Onboarding: the registered name is carried over from sign-up.
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  await expect(page.getByLabel("Registered name")).toHaveValue("Adaeze Catering Ltd");
  await expectNoHorizontalScroll(page);
  const entityId = await completeSetupWizard(page);
  await expect(page.getByRole("heading", { name: "Adaeze Catering Ltd" })).toBeVisible();

  // Quick-add posts a balanced entry; it appears in the list.
  const dialog = await quickAdd(page, "150,000.00");
  await expect(dialog).toBeHidden();
  await page.goto(`/e/${entityId}/transactions`);
  await expect(page.getByRole("table", { name: "Transactions" }).getByText("₦150,000.00")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Lock the current month; posting into it is then refused.
  await page.goto(`/e/${entityId}/periods`);
  const current = page.getByRole("listitem").filter({ hasText: "Current period" });
  await current.getByRole("button", { name: "Lock" }).click();
  await page.getByRole("button", { name: "Lock period" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Locked" }).first()).toBeVisible();
  const refused = await quickAdd(page, "5,000.00");
  await expect(refused.getByRole("alert")).toContainText(/locked/i);
  await refused.getByRole("button", { name: "Cancel" }).click();

  // The lock is in the audit log.
  await page.goto(`/e/${entityId}/audit?action=period.`);
  await expect(page.getByText("Period locked")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Reports: the trial balance balances and exports to CSV and Excel.
  await page.goto(`/e/${entityId}/reports/trial-balance`);
  await expect(page.getByText("Integrity check failed")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "CSV" }).click()]);
  expect(csv.suggestedFilename()).toMatch(/_trial-balance_.*\.csv$/);
  const text = await readFile(await csv.path(), "utf8");
  expect(text).toContain("Trial balance");
  expect(text).toMatch(/Total,150000\.00,150000\.00/);
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel" }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
});
