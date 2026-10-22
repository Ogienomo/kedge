/** SPEC §6.2 firm set-up wizard: firm details and brand colour, first client, team invitation. */
import { expect, test } from "@playwright/test";
import { completeSetupWizard, expectNoHorizontalScroll, signUp, uniqueEmail } from "./support";

test("a new firm sets its brand, adds its first client and invites a colleague", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("firm"), name: "Tunde Bello", orgName: "Bello & Co", kind: "firm" });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\/firm$/);
  await expect(page.getByRole("heading", { name: "About your firm" })).toBeVisible();
  await expect(page.getByLabel("Firm name")).toHaveValue("Bello & Co");
  await page.getByLabel("Brand colour (optional)").fill("#1f6feb");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Continue" }).click();

  await completeSetupWizard(page, { legalName: "Lekki Clinic Ltd", noun: "client", finish: "continue" });

  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
  const colleague = uniqueEmail("colleague");
  await page.getByRole("button", { name: "Invite someone" }).click();
  await page.getByLabel("Email").fill(colleague);
  await page.getByLabel("Access to").selectOption({ label: "Whole organisation" });
  await page.getByLabel("Role").selectOption({ label: "Accountant" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(colleague)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Go to your clients" }).click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByText("Lekki Clinic Ltd")).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/\/practice$/);
});
