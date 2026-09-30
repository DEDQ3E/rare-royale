// A one-minute MP4 demo WITH SOUND for the pull request (GitHub plays MP4 attachments inline; 10 MB at most there).
// Same set-up as tests/video.mjs: the real SDK runtime and a real Friend read live from mainnet (tests/live.mjs: only
// the wallet and ownership answers are mocked), recorded by tab capture in headless Microsoft Edge, cropped to the game
// frame. It starts in the lobby about 11 seconds before the drop, on camera: pick Hide and the quietest drop, enter for
// 1 RF and watch the countdown run out; then the round with its paid moments: Pry on the landing crate, a shield, a shout,
// Smoke out of a fight, the furnace lit at 30 RF burned, the late game and the results. The recorder pauses while the
// script waits for the next moment, so the tape shows the moments, not the waiting.
// A round's number comes from the minute the lobby opens; with `round` the page clock starts in the minute that opens
// that round (pick one whose furnace lights mid-battle while your Friend is still standing).
// Needs: Microsoft Edge installed (MediaRecorder writes H.264/AAC MP4 itself; no ffmpeg).
// Run: node tests/video-pr.mjs [tokenId] [round] → media/rare-royale.mp4
import { writeFileSync } from "node:fs";
import { liveRuntime } from "./live.mjs";

const id = BigInt(process.argv[2] ?? 66666), round = Number(process.argv[3] ?? 0);
const EPOCH = Date.UTC(2026, 8, 20);
const rt = await liveRuntime({ launch: { channel: "msedge", ignoreDefaultArgs: ["--mute-audio"], args: ["--auto-accept-this-tab-capture", "--autoplay-policy=no-user-gesture-required"] } });
try {
  // The lobby opens on arrival and its round is the minute of the drop, one minute later.
  const clock = round ? EPOCH + (round - 1) * 60_000 + 5_000 : Date.now();
  const { page, game, errors, close } = await rt.open(id, { width: 1000, height: 720, clock });
  const wait = ms => page.waitForTimeout(ms);
  const gotIt = () => game.getByRole("button", { name: /Got it/ }).click({ timeout: 1500 }).catch(() => {});
  const at = async (t0, ms, hold) => { await page.clock.setSystemTime(t0 + ms); await wait(hold); };
  const decision = title => game.locator(".rr-decision").filter({ hasText: title });
  const live = () => game.getByLabel("Arena camera").isVisible().catch(() => false);
  const burned = async () => Number(/([\d.]+) RF burned/.exec(await game.locator(".rr-furnace").getAttribute("aria-label").catch(() => "") ?? "")?.[1] ?? 0);

  // Off camera: skip the guide, then jump the lobby clock to about 13 seconds before the drop.
  await game.getByRole("dialog", { name: "How to play" }).waitFor({ timeout: 90_000 });
  await game.getByRole("button", { name: "Skip" }).click(); await wait(800);
  const left = async () => { const m = /Drop in\s*(\d+):(\d+)/.exec(await game.locator(".rr-clock").innerText()); return m ? (+m[1] * 60 + +m[2]) : 0; };
  const now = await game.locator("body").evaluate(() => Date.now());
  await page.clock.setSystemTime(now + ((await left()) - 13) * 1000); await wait(1200);

  // A recorder button outside the game (tab capture needs a real click); it hides itself once recording.
  await page.evaluate(() => {
    const b = document.createElement("button"); b.id = "rec"; b.textContent = "rec"; b.style.cssText = "position:fixed;left:0;top:0;opacity:.01;z-index:9";
    document.body.append(b);
    b.onclick = async () => {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true });
      const [v] = s.getVideoTracks(); const frame = document.querySelector(".rf-game-frame");
      if (frame && window.CropTarget) await v.cropTo(await window.CropTarget.fromElement(frame));
      const r = new MediaRecorder(s, { mimeType: "video/mp4;codecs=avc1.4D401F,mp4a.40.2", videoBitsPerSecond: 1_900_000, audioBitsPerSecond: 96_000 }), parts = [];
      r.ondataavailable = e => parts.push(e.data); r.start(1000); b.remove();
      window.__pause = () => r.pause(); window.__resume = () => r.resume();
      window.__stop = () => new Promise(res => { r.onstop = async () => { const buf = new Uint8Array(await new Blob(parts, { type: "video/mp4" }).arrayBuffer()); s.getTracks().forEach(t => t.stop()); res(Array.from(buf)); }; r.stop(); });
    };
  });
  await page.click("#rec"); await page.waitForFunction(() => !!window.__stop);
  const rec0 = Date.now();
  let paused = 0;
  /** Off the tape: moves the round on a second at a time until `ready()` (at most `limit` seconds), then records again. */
  const skipTo = async (ready, limit = 60) => {
    const p0 = Date.now(); await page.evaluate(() => window.__pause());
    for (let i = 0; i < limit && (await live()) && !(await ready()); i++) {
      const t = await game.locator("body").evaluate(() => Date.now());
      await page.clock.setSystemTime(t + 1000); await wait(120);
    }
    await page.evaluate(() => window.__resume()); paused += Date.now() - p0;
  };

  // 1. The lobby, on camera: Hide, the quietest place on the island, enter for 1 RF; the countdown runs out.
  await wait(1200);
  await game.getByRole("button", { name: /^Hide/ }).click(); await wait(1500);
  const pins = await game.getByRole("button", { name: /^Drop at/ }).evaluateAll(els => els.map(e => Number(/: (\d+) Friends/.exec(e.getAttribute("aria-label") ?? "")?.[1] ?? 99)));
  await game.getByRole("button", { name: /^Drop at/ }).nth(pins.indexOf(Math.min(...pins))).click(); await wait(1500);
  await game.getByRole("button", { name: /Enter round/ }).click(); await wait(1600); await gotIt();
  await game.getByLabel("Arena camera").waitFor({ timeout: 20_000 });
  const t0 = await game.locator("body").evaluate(() => Date.now());
  console.log("round:", await game.locator(".rr-round").innerText());
  const log = async label => console.log(label, ((await game.locator("body").evaluate(() => Date.now())) - t0) / 1000, await game.locator(".rr-round").innerText().catch(() => ""), await burned());
  // 2. The drop: the airship crosses the island and every Friend parachutes down.
  await wait(7000);
  // 3. The landing crate: two free options and the paid call on key 3. Pry: loot one tier better, 0.5 RF burned.
  if (!(await decision("Crate nearby").isVisible())) await skipTo(() => decision("Crate nearby").isVisible(), 20);
  if (await decision("Crate nearby").isVisible()) {
    await wait(2200); await game.locator("body").press("3"); await wait(3200);
  } else console.log("no crate decision");
  await log("4. Point at the s");
  // 4. Point at the shield to see what it does for the odds, then buy it. The capsule lands, the furnace burns.
  await at(t0, 26_000, 1200);
  await game.locator(".rr-buy-wrap").first().hover(); await wait(2000);
  await game.locator("body").press("s"); await wait(2400);
  await log("5. A paid shout");
  // 5. A paid shout over the arena.
  await game.getByRole("button", { name: /^Shout/ }).click(); await wait(400);
  await game.getByRole("menuitem").first().click(); await wait(2200);
  await log("6. An enemy spott");
  // 6. An enemy spotted: Smoke hides the Friend from every rival and gets it out of the fight.
  await skipTo(() => decision("Enemy spotted").isVisible(), 40);
  if (await decision("Enemy spotted").isVisible()) {
    await wait(2000); await game.locator("body").press("3"); await wait(4000);
  } else console.log("no engage decision");
  await log("7. The furnace");
  // 7. The furnace is lit once the round has burned 30 RF: embers over the arena, a banner, its own roar.
  await skipTo(async () => (await burned()) >= 28.5 || (await game.locator(".rr-alerts").innerText()).includes("Furnace lit"), 90);
  const lit = await game.locator(".rr-alerts").filter({ hasText: "Furnace lit" }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
  console.log("furnace lit:", lit, await burned());
  await wait(lit ? 3600 : 500);
  await log("8. The late game");
  // 8. The late game in a small circle.
  await at(t0, 150_000, 4500);
  await log("9. Results");
  // 9. Results: payouts and the round's burn split by source, with your calls, and the furnace badge.
  await page.clock.setSystemTime(t0 + 300_000);
  await game.getByText("Next lobby opens in").waitFor({ timeout: 30_000 }).catch(async e => { await page.screenshot({ path: "tmp/vid-fail.png" }); console.log(await game.locator("body").innerText().catch(() => "?")); throw e; });
  console.log("place:", await game.locator(".rr-yours .rr-huge").textContent());
  await wait(9000);

  const ms = Date.now() - rec0 - paused;
  const bytes = await page.evaluate(() => window.__stop());
  writeFileSync("media/rare-royale.mp4", Buffer.from(bytes));
  console.log("media/rare-royale.mp4", (ms / 1000).toFixed(1), "s", (bytes.length / 1e6).toFixed(2), "MB", errors.length ? "ERRORS " + errors.join("; ") : "");
  await close();
} finally { await rt.close(); }
