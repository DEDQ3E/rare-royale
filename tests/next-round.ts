/** Regression: a second round must start after the first. Play a round, wait for the next lobby (or press
 * "Next round now" with `button`), enter again and let the countdown run out.
 * Usage: node tests/next-round.ts [wait|button] */
import { mkdirSync } from "node:fs";
import { testGame } from "@rarefriends/friendsdk/testing";

const out = "./tmp/next-round", mode = process.argv[2] ?? "wait";
mkdirSync(out, { recursive: true });

await testGame("./games/rare-royale", {
  width: 960, height: 808, timeout: 180_000,
  check: async ({ page, game }) => {
    const errors: string[] = [];
    page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}\n${e.stack}`));
    const shot = async (name: string) => { await page.waitForTimeout(700); await page.locator(".rf-game-frame").screenshot({ path: `${out}/${name}.png` }); console.log(`shot ${name}`); };
    const gotIt = () => game.getByRole("button", { name: /Got it/ }).click({ timeout: 1500 }).catch(() => {});
    await page.clock.install({ time: Date.now() });
    await page.clock.resume();
    await game.getByRole("dialog", { name: "How to play" }).waitFor({ timeout: 60_000 });
    await game.getByRole("button", { name: "Skip" }).click();
    await game.getByRole("button", { name: /^Locker/ }).click();
    await game.getByRole("dialog", { name: "Locker" }).getByRole("button", { name: /^2 RF/ }).first().click();
    await gotIt();
    await game.getByRole("dialog", { name: "Locker" }).getByRole("button", { name: /^Close/ }).click();
    await game.getByRole("button", { name: /Enter round/ }).click();
    await gotIt();
    await game.getByRole("button", { name: /^Loot/ }).click();
    await game.getByRole("button", { name: /^Drop at/ }).first().click();
    await game.getByRole("button", { name: "Start now" }).click();
    let t0 = await game.locator("body").evaluate(() => Date.now());
    await game.getByLabel("Arena camera").waitFor();
    console.log("round 1 live");
    await page.clock.setSystemTime(t0 + 300_000);
    await game.getByText("Next lobby opens in").waitFor({ timeout: 30_000 });
    console.log("round 1 results");
    if (mode === "button") await game.getByRole("button", { name: "Next round now" }).click();
    else { t0 = await game.locator("body").evaluate(() => Date.now()); await page.clock.setSystemTime(t0 + 30_000); }
    await game.getByRole("button", { name: /Enter round/ }).waitFor({ timeout: 30_000 });
    console.log("lobby 2");
    await shot("1-lobby2");
    await game.getByRole("button", { name: /Enter round/ }).click();
    await gotIt();
    await game.getByRole("button", { name: /^Loot/ }).click();
    await game.getByRole("button", { name: /^Drop at/ }).nth(2).click();
    // Let the lobby run out on its own, second by second.
    for (let i = 0; i < 70; i++) await page.clock.runFor(1000);
    await page.waitForTimeout(1500);
    await shot("2-after-countdown");
    const live = await game.getByLabel("Arena camera").isVisible().catch(() => false);
    const pageErrors = errors.filter(e => e.startsWith("pageerror"));
    if (!live || pageErrors.length) throw new Error(`Round 2 did not start.\n${pageErrors.join("\n")}`);
    console.log("round 2 live");
  },
});
