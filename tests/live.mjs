// Runs the game's real SDK runtime (sandboxed iframe, wallet flow, fresh ownership check) for one chosen
// Generations Friend, with its artwork, family, seed and generation read LIVE from Robinhood mainnet through
// public view calls. Only the wallet account and the ownership answers are mocked, as `friendsdk test` does
// for its fixture Friend. Automated media and checks only: nothing here is shipped or published.
// Needs (not in package.json): npm install --no-save playwright
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { decodeFunctionData, encodeEventTopics, encodeFunctionResult, padHex, parseAbi, zeroAddress } from "viem";
import { buildGame, createGameServer } from "../node_modules/@rarefriends/friendsdk/scripts/dev-game.mjs";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const COLLECTION = "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D";
const OWNER = "0x1111111111111111111111111111111111111111", FRIEND_WALLET = "0x3333333333333333333333333333333333333333";
const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function balanceOf(address account) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function generation(uint256 tokenId) view returns (uint8)",
  "function tokenBoundAccount(uint256 tokenId) view returns (address)",
]);
const live = async body => (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

async function install(page, origin, id, errors) {
  await page.addInitScript(owner => {
    const listeners = new Map(), state = { accounts: [] };
    window.ethereum = {
      async request({ method }) {
        if (method === "eth_accounts") return state.accounts;
        if (method === "eth_requestAccounts") { state.accounts = [owner]; return state.accounts; }
        if (method === "eth_chainId") return "0x1237";
        throw new Error(`Unexpected wallet method: ${method}`); // never signs
      },
      on(e, l) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(l); },
      removeListener(e, l) { listeners.get(e)?.delete(l); },
    };
  }, OWNER);
  async function answer(req) {
    if (req.method === "eth_getLogs") { // the mocked wallet's mint of this one Friend
      const f = req.params[0]; assert.equal(f.address.toLowerCase(), COLLECTION.toLowerCase());
      const result = f.topics[1] ? [] : [{ address: COLLECTION, blockNumber: "0x10", blockHash: padHex("0x10", { size: 32 }), data: "0x", logIndex: "0x0",
        transactionHash: padHex("0x1234", { size: 32 }), transactionIndex: "0x0", removed: false,
        topics: encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: zeroAddress, to: OWNER, tokenId: id } }) }];
      return { jsonrpc: "2.0", id: req.id, result };
    }
    if (req.method === "eth_call" && req.params[0].to.toLowerCase() === COLLECTION.toLowerCase()) {
      const { functionName, args } = decodeFunctionData({ abi: ABI, data: req.params[0].data });
      if (functionName !== "balanceOf") assert.equal(args[0], id, "only the chosen Friend is ever read");
      if (functionName === "generation") return live(req); // real generation
      const value = functionName === "balanceOf" ? 1n : functionName === "ownerOf" ? OWNER : functionName === "tokenBoundAccount" ? FRIEND_WALLET : null;
      if (value === null) throw new Error(`Unsupported collection read ${functionName}`);
      return { jsonrpc: "2.0", id: req.id, result: encodeFunctionResult({ abi: ABI, functionName, result: value }) };
    }
    if (["eth_call", "eth_chainId", "eth_blockNumber"].includes(req.method)) return live(req); // artwork registry: real
    throw new Error(`Unexpected RPC ${req.method}`);
  }
  await page.route("**/*", async r => {
    try {
      const url = new URL(r.request().url());
      if (url.origin === origin || ["blob:", "data:"].includes(url.protocol)) return r.continue();
      assert.equal(url.origin, RPC, "no other external services");
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type" } });
      const body = r.request().postDataJSON();
      const res = Array.isArray(body) ? await Promise.all(body.map(answer)) : await answer(body);
      return r.fulfill({ json: res, headers: { "access-control-allow-origin": "*" } });
    } catch (e) { errors.push(e.message); await r.abort("blockedbyclient"); }
  });
}

/** Build the game once and serve it; `open(id, viewport)` connects, picks that Friend and waits for the game. */
export async function liveRuntime({ launch = {} } = {}) {
  const temp = mkdtempSync(join(tmpdir(), "royale-live-"));
  const build = await buildGame(resolve("./games/rare-royale"), { outdir: join(temp, "dist") });
  const server = createGameServer(build.outdir);
  await new Promise(res => server.listen(0, "127.0.0.1", res));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(launch);
  return {
    async open(id, { width = 1000, height = 760, scale = 1 } = {}) {
      const errors = [];
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, deviceScaleFactor: scale });
      const page = await context.newPage(); page.setDefaultTimeout(90000);
      page.on("pageerror", e => errors.push(String(e)));
      await install(page, origin, id, errors);
      await page.goto(origin);
      await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
      await page.getByRole("button", { name: new RegExp(`^Friend #${id}\\b`) }).click();
      const game = page.frameLocator("iframe");
      await game.getByRole("dialog", { name: "How to play" }).waitFor();
      return { page, game, root: page.locator("#root"), errors, close: () => context.close() };
    },
    async close() { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); await build.close(); rmSync(temp, { recursive: true, force: true }); },
  };
}
