// A demo video WITH SOUND of the real game: the real SDK runtime and a real Friend read live from mainnet
// (tests/live.mjs: only the wallet and ownership answers are mocked), recorded as the tab plays, picture and sound
// together (tab capture in headless Microsoft Edge, cropped to the game frame). A fake clock skips the quiet parts of
// the round, so each jump is a hard cut. Also writes a short silent GIF of the battle for the README.
// Needs (not in package.json): npm install --no-save gifenc pngjs fix-webm-duration; Microsoft Edge installed.
// Run: node tests/video.mjs [tokenId] → media/rare-royale.webm, media/rare-royale.gif
import { readFileSync, writeFileSync } from "node:fs";
import gifenc from "gifenc";
import { PNG } from "pngjs";
import { liveRuntime } from "./live.mjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const id = BigInt(process.argv[2] ?? 66666);
const rt = await liveRuntime({ launch: { channel: "msedge", ignoreDefaultArgs: ["--mute-audio"], args: ["--auto-accept-this-tab-capture", "--autoplay-policy=no-user-gesture-required"] } });
try {
  const { page, game, errors, close } = await rt.open(id, { width: 1000, height: 720 });
  await page.clock.install({ time: Date.now() }); await page.clock.resume();
  const wait = ms => page.waitForTimeout(ms);
  const gotIt = () => game.getByRole("button", { name: /Got it/ }).click({ timeout: 1500 }).catch(() => {});

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

  // The guide, then the lobby: tactic, a Starfall aura from the Locker, a drop, the entry.
  await wait(2500);
  await game.getByRole("button", { name: /^Next/ }).click(); await wait(1600);
  await game.getByRole("button", { name: "Skip" }).click(); await wait(1500);
  await game.getByRole("button", { name: /^Hide/ }).click(); await wait(900);
  await game.getByRole("button", { name: /^Locker/ }).click(); await wait(1400);
  await game.getByRole("dialog", { name: "Locker" }).getByRole("button", { name: /^5 RF/ }).first().click(); await gotIt(); await wait(1600);
  await game.getByRole("dialog", { name: "Locker" }).getByRole("button", { name: /^Close/ }).click(); await wait(600);
  // The quietest place to land.
  const pins = await game.getByRole("button", { name: /^Drop at/ }).evaluateAll(els => els.map(e => Number(/: (\d+) Friends/.exec(e.getAttribute("aria-label") ?? "")?.[1] ?? 99)));
  await game.getByRole("button", { name: /^Drop at/ }).nth(pins.indexOf(Math.min(...pins))).click(); await wait(900);
  await game.getByRole("button", { name: /Enter round/ }).click(); await gotIt(); await wait(2200);

  // The drop, in real time.
  await game.getByRole("button", { name: "Start now" }).click();
  const t0 = await game.locator("body").evaluate(() => Date.now());
  await wait(15000);
  // Landed and looting: a paid shout.
  await page.clock.setSystemTime(t0 + 24_000); await wait(2500);
  await game.locator("body").press("s"); await wait(2500);
  await page.clock.setSystemTime(t0 + 42_000); await wait(3000);
  await game.getByRole("button", { name: /^Shout/ }).click(); await wait(500);
  await game.getByRole("menuitem").first().click(); await wait(5000);
  // The fights: follow another Friend from the Fighters tab and send it a shield.
  await page.clock.setSystemTime(t0 + 62_000); await wait(3000);
  await game.getByRole("tab", { name: /Fighters/ }).click(); await wait(900);
  await game.getByRole("listitem").nth(1).click(); await wait(1800);
  await game.locator("body").press("s"); await wait(3500);
  await game.getByRole("tab", { name: /Feed/ }).click();
  // The late game.
  await page.clock.setSystemTime(t0 + 120_000); await wait(3000);

  // A GIF of the late game from the broadcast (silent, 480 × 320, a palette per frame).
  const frameBox = page.locator(".rf-game-frame"), gif = GIFEncoder();
  const g0 = Date.now();
  for (let n = 0; n < 26; n++) {
    const png = PNG.sync.read(await frameBox.screenshot({ scale: "css" }));
    const w = 480, h = 320, data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.floor(x * png.width / w), sy = Math.floor(y * png.height / h), si = (sy * png.width + sx) * 4, di = (y * w + x) * 4;
      data[di] = png.data[si]; data[di + 1] = png.data[si + 1]; data[di + 2] = png.data[si + 2]; data[di + 3] = 255;
    }
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: 250 });
    await wait(40);
  }
  gif.finish();
  console.log("gif seconds", ((Date.now() - g0) / 1000).toFixed(1));
  writeFileSync("media/rare-royale.gif", gif.bytes());

  // Results, the replay of the final and the hall of fame.
  await page.clock.setSystemTime(t0 + 300_000);
  await game.getByText("Next lobby opens in").waitFor({ timeout: 30_000 });
  console.log("place:", await game.locator(".rr-yours .rr-huge").textContent(), "|", await game.locator(".rr-yours .rr-win, .rr-yours .rr-muted").first().textContent());
  await wait(3500);
  await game.getByRole("button", { name: /Replay the final/ }).click(); await wait(13000);
  await game.getByRole("dialog", { name: "Replay of the final" }).getByRole("button", { name: /^Close/ }).click(); await wait(1500);
  await game.getByRole("button", { name: "Hall of fame (H)" }).click(); await wait(4500);

  const bytes = await page.evaluate(ms => window.__stop(ms), Date.now() - rec0);
  writeFileSync("media/rare-royale.webm", Buffer.from(bytes));
  console.log("media/rare-royale.webm", (bytes.length / 1e6).toFixed(1), "MB", errors.length ? "ERRORS " + errors.join("; ") : "");
  await close();
} finally { await rt.close(); }
