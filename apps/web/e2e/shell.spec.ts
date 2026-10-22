/** AC-0.7 (automated part): the shell, switchers and mode toggle at 360 px and 1440 px, light and dark. */
import { expect, test } from "@playwright/test";
import { completeSetupWizard, expectNoHorizontalScroll, signUp, uniqueEmail } from "./support";

for (const colorScheme of ["light", "dark"] as const) {
  test(`app shell in ${colorScheme} theme`, async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, colorScheme });
    const p = await context.newPage();
    const email = uniqueEmail(`shell-${colorScheme}`);
    await signUp(p, { email, name: "Tunde Bello", orgName: "Bello & Co", kind: "firm" });
    await p.getByRole("button", { name: "Continue" }).click();

    // A new firm starts in its set-up wizard; skipping it lands on the client list.
    await expect(p).toHaveURL(/\/onboarding\/firm$/);
    await p.getByRole("link", { name: "Skip set-up" }).click();
    await expect(p).toHaveURL(/\/practice$/);
    await p.getByRole("link", { name: "Add client" }).first().click();
    await completeSetupWizard(p, { legalName: "Adaeze Catering Ltd", noun: "client" });
    await expect(p.getByRole("heading", { name: "Adaeze Catering Ltd" })).toBeVisible();

    expect(await p.evaluate(() => document.documentElement.dataset.theme)).toBe(colorScheme);
    await expectNoHorizontalScroll(p);

    // Entity switcher lists the client and the "all businesses" view.
    await p.getByRole("button", { name: "Switch organisation or business" }).click();
    await expect(p.getByRole("menuitem", { name: "Adaeze Catering Ltd" })).toBeVisible();
    await p.keyboard.press("Escape");

    // Mode toggle: in the header on desktop, in the user menu on mobile.
    const wide = (p.viewportSize()?.width ?? 0) >= 1024;
    if (!wide) await p.getByRole("button", { name: "Your account" }).click();
    const toggle = p.getByRole("radiogroup", { name: "Display mode" }).first();
    await expect(toggle.getByRole("radio", { name: "Accountant" })).toHaveAttribute("aria-checked", "true");
    await toggle.getByRole("radio", { name: "Simple" }).click();
    await expect(p.getByText("Money you have")).toBeVisible();
    if (!wide) {
      await p.keyboard.press("Escape");
      await expect(p.getByRole("menu")).toBeHidden();
    }

    // Search opens with "/".
    await p.keyboard.press("/");
    await expect(p.getByRole("combobox")).toBeFocused();
    await p.keyboard.press("Escape");

    for (const path of ["/practice", "/org/settings", "/account"]) {
      await p.goto(path);
      await expectNoHorizontalScroll(p);
    }
    await context.close();
  });
}
