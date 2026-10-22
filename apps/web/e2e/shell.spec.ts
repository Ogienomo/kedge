/** AC-0.7 (automated part): the shell, switchers and mode toggle at 360 px and 1440 px, light and dark. */
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signUp, uniqueEmail } from "./support";

for (const colorScheme of ["light", "dark"] as const) {
  test(`app shell in ${colorScheme} theme`, async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, colorScheme });
    const p = await context.newPage();
    const email = uniqueEmail(`shell-${colorScheme}`);
    await signUp(p, { email, name: "Tunde Bello", orgName: "Bello & Co", kind: "firm" });
    await p.getByRole("button", { name: "Continue" }).click();

    // Add a client, which opens its dashboard.
    await p.getByRole("button", { name: "Add client" }).first().click();
    await p.getByLabel("Registered name").fill("Adaeze Catering Ltd");
    await p.getByRole("button", { name: "Add client" }).last().click();
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
    await expect(p.getByText("Your books are ready to set up")).toBeVisible();
    if (!wide) await p.keyboard.press("Escape");

    // Search opens with "/".
    await p.keyboard.press("/");
    await expect(p.getByRole("combobox")).toBeFocused();
    await p.keyboard.press("Escape");

    for (const path of ["/", "/org/settings", "/account"]) {
      await p.goto(path);
      await expectNoHorizontalScroll(p);
    }
    await context.close();
  });
}
