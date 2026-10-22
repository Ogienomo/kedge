/**
 * AC-0.1: a user can sign up, verify their email, log in, enable TOTP MFA,
 * and log in with MFA. Also covers AC-0.2 through the UI.
 */
import { expect, test } from "@playwright/test";
import { PASSWORD, signUp, totp, uniqueEmail } from "./support";

test.describe.configure({ mode: "serial" });

test("sign up, verify email, enable TOTP and log in with MFA", async ({ page }) => {
  // Waits for a fresh 30 s TOTP window, so it needs more than the default timeout.
  test.setTimeout(120_000);
  const email = uniqueEmail("ac01");
  await signUp(page, { email, name: "Ada Obi", orgName: "Ada Bakery", kind: "business" });

  // Welcome step creates the organisation (AC-0.2) and opens the set-up wizard.
  await expect(page.getByLabel("Business name")).toHaveValue("Ada Bakery");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "About your business" })).toBeVisible();

  // Enable TOTP.
  await page.goto("/account");
  await page.getByRole("button", { name: "Set up two-step verification" }).click();
  const secret = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel("Code from the app").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("On", { exact: true })).toBeVisible();

  // Log out, then log in: password first, then the authenticator code.
  await page.getByRole("button", { name: "Your account" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/mfa/);

  // Pages stay behind the second factor until it is verified.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/mfa/);

  // Avoid reusing the code from enrolment if we are still in the same 30 s window.
  const now = Date.now();
  await page.waitForTimeout(30_000 - (now % 30_000) + 500);
  await page.getByLabel("Authentication code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  // Back to the page that was asked for before the second factor.
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
});

test("wrong password is refused without revealing whether the account exists", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(uniqueEmail("nobody"));
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  // Next's route announcer is also an alert region; match ours by its text.
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
});

test("signed-out visitors are sent to log in", async ({ page }) => {
  await page.goto("/org/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Forg%2Fsettings/);
});
