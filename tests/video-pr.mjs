// A one-minute MP4 demo WITH SOUND for the pull request (GitHub plays MP4 attachments inline; 10 MB at most there).
// Same set-up as tests/video.mjs: the real SDK runtime and a real Friend read live from mainnet (tests/live.mjs: only
// the wallet and ownership answers are mocked), recorded by tab capture in headless Microsoft Edge, cropped to the game
// frame. This one starts in the lobby about 11 seconds before the drop, on camera: pick a tactic and a drop, enter for
// 1 RF and watch the countdown run out; then the battle, with a fake clock cutting through the quiet parts, and the results.
// Needs: Microsoft Edge installed (MediaRecorder writes H.264/AAC MP4 itself; no ffmpeg).
// Run: node tests/video-pr.mjs [tokenId] → media/rare-royale.mp4
import { writeFileSync } from "node:fs";
import { liveRuntime } from "./live.mjs";

const id = BigInt(process.argv[2] ?? 66666);
const rt = await liveRuntime({ launch: { channel: "msedge", ignoreDefaultArgs: ["--mute-audio"], args: ["--auto-accept-this-tab-capture", "--autoplay-policy=no-user-gesture-required"] } });
try {
  const { page, game, errors, close } = await rt.open(id, { width: 1000, height: 720 });
  await page.clock.install({ time: Date.now() }); await page.clock.resume();
  const wait = ms => page.waitForTimeout(ms);
  const gotIt = () => game.getByRole("button", { name: /Got it/ }).click({ timeout: 1500 }).catch(() => {});
  const at = async (t0, ms, hold) => { await page.clock.setSystemTime(t0 + ms); await wait(hold); };

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
      window.__stop = () => new Promise(res => { r.onstop = async () => { const buf = new Uint8Array(await new Blob(parts, { type: "video/mp4" }).arrayBuffer()); s.getTracks().forEach(t => t.stop()); res(Array.from(buf)); }; r.stop(); });
    };
  });
  await page.click("#rec"); await page.waitForFunction(() => !!window.__stop);
  const rec0 = Date.now();

  // 1. The lobby, on camera: Hide, the quietest place on the island, enter for 1 RF; the countdown runs out.
  await wait(1200);
  await game.getByRole("button", { name: /^Hide/ }).click(); await wait(1500);
  const pins = await game.getByRole("button", { name: /^Drop at/ }).evaluateAll(els => els.map(e => Number(/: (\d+) Friends/.exec(e.getAttribute("aria-label") ?? "")?.[1] ?? 99)));
  await game.getByRole("button", { name: /^Drop at/ }).nth(pins.indexOf(Math.min(...pins))).click(); await wait(1500);
  await game.getByRole("button", { name: /Enter round/ }).click(); await wait(1600); await gotIt();
  await game.getByLabel("Arena camera").waitFor({ timeout: 20_000 });
  const t0 = await game.locator("body").evaluate(() => Date.now());
  // 2. The drop: the airship crosses the island and every Friend parachutes down.
  await wait(8000);
  // 3. Landed: point at the shield to see what it does for the odds, then buy it. The capsule lands, the furnace burns.
  await at(t0, 26_000, 2500);
  await game.locator(".rr-buy-wrap").first().hover(); await wait(2200);
  await game.locator("body").press("s"); await wait(2600);
  // 4. A paid shout over the arena.
  await game.getByRole("button", { name: /^Shout/ }).click(); await wait(400);
  await game.getByRole("menuitem").first().click(); await wait(2600);
  // 5. The fights: follow another Friend from the Fighters tab and sponsor it.
  await at(t0, 64_000, 1500);
  await game.getByRole("tab", { name: /Fighters/ }).click(); await wait(1000);
  await game.getByRole("listitem").nth(1).click(); await wait(1400);
  await game.locator("body").press("s"); await wait(2600);
  await game.getByRole("tab", { name: /Feed/ }).click();
  // 6. Mid-game rotations as the storm closes in, then the late game in a small circle.
  await at(t0, 105_000, 4000);
  await at(t0, 140_000, 7000);
  // 7. Results: payouts and the round's burn split by source.
  await page.clock.setSystemTime(t0 + 300_000);
  await game.getByText("Next lobby opens in").waitFor({ timeout: 30_000 });
  const place = await game.locator(".rr-yours .rr-huge").textContent();
  console.log("place:", place);
  await wait(9000);

  const ms = Date.now() - rec0;
  const bytes = await page.evaluate(() => window.__stop());
  writeFileSync("media/rare-royale.mp4", Buffer.from(bytes));
  console.log("media/rare-royale.mp4", (ms / 1000).toFixed(1), "s", (bytes.length / 1e6).toFixed(2), "MB", errors.length ? "ERRORS " + errors.join("; ") : "");
  await close();
} finally { await rt.close(); }
