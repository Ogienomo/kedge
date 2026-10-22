/** Invitation acceptance through the UI for a brand-new user (AC-0.3 happy path, end to end). */
import { expect, test } from "@playwright/test";
import { completeSetupWizard, PASSWORD, signUp, uniqueEmail } from "./support";

test("an owner invites a client owner who signs up and lands in the business", async ({ page, browser }) => {
  const ownerEmail = uniqueEmail("owner");
  await signUp(page, { email: ownerEmail, name: "Ngozi Okafor", orgName: "Okafor & Partners", kind: "firm" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Skip set-up" }).click();
  await page.getByRole("link", { name: "Add client" }).first().click();
  await completeSetupWizard(page, { legalName: "Lekki Clinic Ltd", noun: "client" });
  await expect(page.getByRole("heading", { name: "Lekki Clinic Ltd" })).toBeVisible();

  const clientEmail = uniqueEmail("client");
  await page.goto("/org/settings");
  await page.getByRole("button", { name: "Invite someone" }).click();
  await page.getByLabel("Email").fill(clientEmail);
  await page.getByLabel("Access to").selectOption({ label: "Lekki Clinic Ltd" });
  await page.getByLabel("Role").selectOption({ label: "Business owner" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(clientEmail)).toBeVisible();

  // The app's invitation email goes to the dev outbox when Resend is not configured.
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = `${process.cwd()}/.dev-outbox`;
  const files = (await readdir(dir)).sort().reverse();
  let link = "";
  for (const f of files) {
    const msg = JSON.parse(await readFile(`${dir}/${f}`, "utf8")) as { to: string; text: string };
    if (msg.to === clientEmail) {
      link = msg.text.match(/https?:\/\/\S+\/invite\/[A-Za-z0-9_-]+/)?.[0] ?? "";
      break;
    }
  }
  expect(link).not.toBe("");

  const client = await (await browser.newContext()).newPage();
  await client.goto(link);
  await expect(client.getByRole("heading", { name: "Lekki Clinic Ltd" })).toBeVisible();
  await client.getByRole("link", { name: "Create an account" }).click();
  await client.getByLabel("Your name").fill("Chioma Eze");
  await client.getByLabel("Password").fill(PASSWORD);
  await client.getByRole("button", { name: "Create account" }).click();
  const { linkFromEmail } = await import("./support");
  await client.goto(await linkFromEmail(clientEmail, "/auth/confirm"));
  await expect(client).toHaveURL(/\/invite\//);
  await client.getByRole("button", { name: "Accept invitation" }).click();
  await expect(client.getByRole("heading", { name: "Lekki Clinic Ltd" })).toBeVisible();
  // Client owners start in Simple mode.
  await expect(client.getByText("Money you have")).toBeVisible();
});
