// A one-minute demo video WITH SOUND of the real game: the real SDK runtime and a real Friend read live from mainnet
// (tests/live.mjs: only the wallet and ownership answers are mocked), recorded as the tab plays, picture and sound
// together (tab capture in headless Microsoft Edge, cropped to the game frame). It opens on the drop and cuts
// straight through the main features; a fake clock skips the quiet parts of the round, so each jump is a hard cut.
// The lobby set-up (tactic, a Starfall aura, the drop, the entry) happens before recording starts.
// Needs (not in package.json): npm install --no-save fix-webm-duration; Microsoft Edge installed.
// Run: node tests/video.mjs [tokenId] → media/rare-royale.webm
import { readFileSync, writeFileSync } from "node:fs";
import { liveRuntime } from "./live.mjs";

const id = BigInt(process.argv[2] ?? 66666);
const rt = await liveRuntime({ launch: { channel: "msedge", ignoreDefaultArgs: ["--mute-audio"], args: ["--auto-accept-this-tab-capture", "--autoplay-policy=no-user-gesture-required"] } });
try {
  const { page, game, errors, close } = await rt.open(id, { width: 1000, height: 720 });
  await page.clock.install({ time: Date.now() }); await page.clock.resume();
  const wait = ms => page.waitForTimeout(ms);
  const gotIt = () => game.getByRole("button", { name: /Got it/ }).click({ timeout: 1500 }).catch(() => {});
  const at = async (t0, ms, hold) => { await page.clock.setSystemTime(t0 + ms); await wait(hold); };

  // Off camera: skip the guide, pick Hide, buy a Starfall aura, land at the quietest place and enter for 1 RF.
  await game.getByRole("dialog", { name: "How to play" }).waitFor({ timeout: 60_000 });
  await game.getByRole("button", { name: "Skip" }).click();
  await game.getByRole("button", { name: /^Hide/ }).click();
  await game.getByRole("button", { name: /^Locker/ }).click();
  await game.getByRole("dialog", { name: "Locker" }).getByRole("button", { name: /^5 RF/ }).first().click(); await gotIt();
  await game.getByRole("dialog", { name: "Locker" }).getByRole("button", { name: /^Close/ }).click();
  const pins = await game.getByRole("button", { name: /^Drop at/ }).evaluateAll(els => els.map(e => Number(/: (\d+) Friends/.exec(e.getAttribute("aria-label") ?? "")?.[1] ?? 99)));
  await game.getByRole("button", { name: /^Drop at/ }).nth(pins.indexOf(Math.min(...pins))).click();
  await game.getByRole("button", { name: /Enter round/ }).click(); await gotIt();
  await wait(1500);

  // A recorder button outside the game (tab capture needs a real click); it hides itself once recording.
  await page.evaluate(() => {
    const b = document.createElement("button"); b.id = "rec"; b.textContent = "rec"; b.style.cssText = "position:fixed;left:0;top:0;opacity:.01;z-index:9";
    document.body.append(b);
    b.onclick = async () => {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true });
      const [v] = s.getVideoTracks(); const frame = document.querySelector(".rf-game-frame");
      if (frame && window.CropTarget) await v.cropTo(await window.CropTarget.fromElement(frame));
      const r = new MediaRecorder(s, { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 }), parts = [];
      r.ondataavailable = e => parts.push(e.data); r.start(1000); b.remove();
      // MediaRecorder leaves the duration out of the file; fix-webm-duration writes it in so players can seek.
      window.__stop = ms => new Promise(res => { r.onstop = async () => { const raw = new Blob(parts, { type: "video/webm" }), blob = window.ysFixWebmDuration ? await window.ysFixWebmDuration(raw, ms, { logger: false }) : raw; const buf = new Uint8Array(await blob.arrayBuffer()); s.getTracks().forEach(t => t.stop()); res(Array.from(buf)); }; r.stop(); });
    };
  });
  await page.addScriptTag({ content: readFileSync("node_modules/fix-webm-duration/fix-webm-duration.js", "utf8") });
  await page.click("#rec"); await page.waitForFunction(() => !!window.__stop);
  const rec0 = Date.now();

  // 1. The drop: the airship crosses the island and every Friend parachutes down.
  await game.getByRole("button", { name: "Start now" }).click();
  const t0 = await game.locator("body").evaluate(() => Date.now());
  await wait(6500);
  // 2. Landed: point at the shield to see what it does for the odds, then buy it. The capsule lands, the furnace burns.
  await at(t0, 26_000, 1800);
  await game.locator(".rr-buy-wrap").first().hover(); await wait(2200);
  await game.locator("body").press("s"); await wait(2800);
  // 3. A paid shout over the arena.
  await game.getByRole("button", { name: /^Shout/ }).click(); await wait(400);
  await game.getByRole("menuitem").first().click(); await wait(2800);
  // 4. The fights: follow another Friend from the Fighters tab and sponsor it.
  await at(t0, 64_000, 1800);
  await game.getByRole("tab", { name: /Fighters/ }).click(); await wait(1000);
  await game.getByRole("listitem").nth(1).click(); await wait(1400);
  await game.locator("body").press("s"); await wait(2800);
  await game.getByRole("tab", { name: /Feed/ }).click();
  // 5. The late game in a small circle.
  await at(t0, 140_000, 5000);
  // 6. Results: payouts and the burn split by source; the replay of the final with its Kingmakers.
  await page.clock.setSystemTime(t0 + 300_000);
  await game.getByText("Next lobby opens in").waitFor({ timeout: 30_000 });
  console.log("place:", await game.locator(".rr-yours .rr-huge").textContent());
  await wait(6500);
  await game.getByRole("button", { name: /Replay the final/ }).click(); await wait(7000);
  await game.getByRole("dialog", { name: "Replay of the final" }).getByRole("button", { name: /^Close/ }).click(); await wait(500);
  // 7. The hall of fame: the live RF supply, the burn per round, champions and their top sponsors.
  await game.getByRole("button", { name: "Hall of fame (H)" }).click(); await wait(4500);
  await game.getByRole("dialog", { name: "Hall of fame" }).getByRole("button", { name: /^Close/ }).click();
  // 8. The next lobby: the island, the tactics and the real odds before entering.
  await game.getByRole("button", { name: "Next round now" }).click(); await wait(5500);
  // The recorder hands over its last second late; keep rolling so the lobby is fully on the tape.
  await wait(1500);

  const ms = Date.now() - rec0;
  const bytes = await page.evaluate(d => window.__stop(d), ms);
  writeFileSync("media/rare-royale.webm", Buffer.from(bytes));
  console.log("media/rare-royale.webm", (ms / 1000).toFixed(1), "s", (bytes.length / 1e6).toFixed(1), "MB", errors.length ? "ERRORS " + errors.join("; ") : "");
  await close();
} finally { await rt.close(); }
