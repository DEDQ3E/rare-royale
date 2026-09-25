/** Screenshots of every screen with the SDK's mock wallet, moving a fake clock through one round.
 * Usage: node tests/shots.ts [outDir=./tmp/shots] [width=960] [height] */

import { mkdirSync } from "node:fs";
import { testGame } from "@rarefriends/friendsdk/testing";

const out = process.argv[2] ?? "./tmp/shots", width = Number(process.argv[3] ?? 960), height = Number(process.argv[4] ?? Math.round(width * 0.8) + 40);
mkdirSync(out, { recursive: true });

await testGame("./games/rare-royale", {
  width, height, timeout: 120_000,
  check: async ({ page, game }) => {
    const errors: string[] = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    const shot = async (name: string) => { await page.waitForTimeout(700); await page.locator(".rf-game-frame").screenshot({ path: `${out}/${name}.png` }); console.log(`shot ${name}`); };
    await page.clock.install({ time: Date.now() });
    await page.clock.resume();
    await game.getByRole("dialog", { name: "How to play" }).waitFor({ timeout: 60_000 });
    await shot("0-tutorial");
    await game.getByRole("button", { name: /^Next/ }).click();
    await game.getByRole("button", { name: /^Next/ }).click();
    await shot("0b-tutorial-drop");
    await game.getByRole("button", { name: "Skip" }).click();
    await shot("1-lobby");
    await game.getByRole("button", { name: /Enter round/ }).click();
    await game.getByRole("button", { name: /Got it/ }).click();
    await game.getByRole("button", { name: /^Loot/ }).click();
    await game.getByRole("button", { name: /^Drop at/ }).first().click();
    await shot("3-lobby-entered");
    await game.getByRole("button", { name: "Start now" }).click();
    const t0 = await game.locator("body").evaluate(() => Date.now());
    await game.getByLabel("Arena camera").waitFor();
    for (const [at, name] of [[5_000, "4-live-drop"], [30_000, "5-live-landed"], [75_000, "6-live-fight"], [130_000, "6b-live-late"]] as const) {
      await page.clock.setSystemTime(t0 + at);
      await page.waitForTimeout(1500);
      await shot(name);
    }
    await page.clock.setSystemTime(t0 + 232_000);
    await game.getByText("Next lobby opens in").waitFor({ timeout: 30_000 });
    await shot("7-results");
    await game.getByRole("button", { name: "Hall of fame (H)" }).click();
    await game.getByRole("dialog", { name: "Hall of fame" }).waitFor();
    await page.waitForTimeout(2500);
    await shot("8-hall");
    if (errors.length) console.log(`CONSOLE ERRORS:\n${errors.join("\n")}`);
  },
});
console.log("done");
