// Tests for the reference round contract (contracts/RareRoyaleRounds.sol) on an in-process EVM.
// Run: npm run test:contract
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import solc from "solc";
import { createEVM } from "@ethereumjs/evm";
import { Common, Mainnet, Hardfork } from "@ethereumjs/common";
import { createBlock } from "@ethereumjs/block";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { Interface, AbiCoder, parseEther } from "ethers";

const rf = s => parseEther(s);
const EPOCH = 1_000_000n, ROUND = 300n, LOBBY = 60n;

function compile() {
  const input = {
    language: "Solidity",
    sources: {
      "RareRoyaleRounds.sol": { content: readFileSync("contracts/RareRoyaleRounds.sol", "utf8") },
      "Mocks.sol": { content: readFileSync("contracts/test/Mocks.sol", "utf8") },
    },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const problems = (out.errors ?? []).filter(e => e.severity === "error" || e.type === "Warning");
  assert.deepEqual(problems.map(e => e.formattedMessage), [], "compiles without errors or warnings");
  const get = (file, name) => ({ abi: new Interface(out.contracts[file][name].abi), bin: out.contracts[file][name].evm.bytecode.object });
  return { rounds: get("RareRoyaleRounds.sol", "RareRoyaleRounds"), token: get("Mocks.sol", "MockRF"), gens: get("Mocks.sol", "MockGenerations") };
}

async function chain() {
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
  const evm = await createEVM({ common });
  let now = EPOCH, height = 1n;
  const block = () => createBlock({ header: { timestamp: now, number: height++, mixHash: hexToBytes("0x" + "ab".repeat(32)) } }, { common });
  const run = async (from, to, data) => {
    const r = await evm.runCall({ caller: from, to, data: hexToBytes(data), block: block(), skipBalance: true, gasLimit: 10_000_000n });
    return r;
  };
  return {
    at: t => { now = t; },
    async deploy(from, c, args = []) {
      const data = "0x" + c.bin + c.abi.encodeDeploy(args).slice(2);
      const r = await run(from, undefined, data);
      assert.equal(r.execResult.exceptionError, undefined, "deploys");
      return r.createdAddress;
    },
    async send(from, to, c, fn, args = []) {
      const r = await run(from, to, c.abi.encodeFunctionData(fn, args));
      if (r.execResult.exceptionError) {
        const ret = bytesToHex(r.execResult.returnValue);
        const reason = ret.startsWith("0x08c379a0") ? AbiCoder.defaultAbiCoder().decode(["string"], "0x" + ret.slice(10))[0] : "revert";
        throw new Error(reason);
      }
      return r;
    },
    async call(to, c, fn, args = []) {
      const r = await run(createAddressFromString("0x" + "00".repeat(19) + "01"), to, c.abi.encodeFunctionData(fn, args));
      return c.abi.decodeFunctionResult(fn, bytesToHex(r.execResult.returnValue));
    },
  };
}

const addr = n => createAddressFromString("0x" + n.toString(16).padStart(40, "0"));
const hex = a => a.toString();

async function setup() {
  const c = compile(), ch = await chain();
  const op = addr(0xA11CE), rewards = addr(0x5EED), players = [1, 2, 3, 4, 5, 6].map(i => addr(0x1000 + i));
  const token = await ch.deploy(op, c.token), gens = await ch.deploy(op, c.gens);
  const rounds = await ch.deploy(op, c.rounds, [hex(token), hex(gens), hex(rewards), EPOCH, hex(op)]);
  for (const [i, p] of players.entries()) {
    await ch.send(op, token, c.token, "mint", [hex(p), rf("100")]);
    await ch.send(p, token, c.token, "approve", [hex(rounds), rf("1000")]);
    await ch.send(op, gens, c.gens, "set", [100 + i, hex(p)]);
  }
  const bal = async a => (await ch.call(token, c.token, "balanceOf", [hex(a)]))[0];
  const supply = async () => (await ch.call(token, c.token, "totalSupply"))[0];
  const R = (from, fn, args) => ch.send(from, rounds, c.rounds, fn, args);
  const view = async (fn, args) => (await ch.call(rounds, c.rounds, fn, args));
  return { c, ch, op, rewards, players, token, gens, rounds, bal, supply, R, view };
}

test("entries are held, then 10% burned and 10% to rewards at settlement; the pool is paid out exactly", async () => {
  const { ch, op, rewards, players, rounds, bal, supply, R, view } = await setup();
  const start = await supply();
  ch.at(EPOCH + 10n);
  for (const [i, p] of players.slice(0, 5).entries()) await R(p, "enter", [0, 100 + i]);
  assert.equal(await bal(rounds), rf("5"));
  assert.equal(await bal(players[0]), rf("99"));

  await assert.rejects(R(players[0], "enter", [0, 100]), /already entered/);
  await assert.rejects(R(players[5], "enter", [0, 100]), /not your Friend/);
  await assert.rejects(R(op, "lock", [0]), /lobby open/);

  ch.at(EPOCH + LOBBY);
  await assert.rejects(R(players[5], "enter", [0, 105]), /lobby closed/);
  await R(op, "lock", [0]);
  assert.notEqual((await view("rounds", [0])).seed, 0n);

  // 5 paid entries hold 4 RF for the ladder and bounties: pay 2.5 + 1 + 0.3, burn 0.2 of storm bounties.
  const wallets = [hex(players[0]), hex(players[1]), hex(players[2])], amounts = [rf("2.5"), rf("1"), rf("0.3")];
  await assert.rejects(R(players[0], "settle", [0, wallets, amounts, rf("0.2")]), /operator/);
  await assert.rejects(R(op, "settle", [0, wallets, amounts, rf("0.1")]), /exactly the pool/);
  ch.at(EPOCH + ROUND);
  await R(op, "settle", [0, wallets, amounts, rf("0.2")]);
  await assert.rejects(R(op, "settle", [0, wallets, amounts, rf("0.2")]), /not settleable/);

  assert.equal(await bal(rewards), rf("0.5"));
  assert.equal(await supply(), start - rf("0.7"));
  assert.equal((await view("totalBurned"))[0], rf("0.7"));
  await R(players[0], "claim", []);
  assert.equal(await bal(players[0]), rf("101.5"));
  await assert.rejects(R(players[0], "claim", []), /nothing to claim/);
  assert.equal(await bal(rounds), rf("1.3"));
});

test("sponsoring burns 50% at once, second lives cost 2, 4, 8 RF, and the window closes", async () => {
  const { ch, op, rewards, players, bal, supply, R } = await setup();
  const start = await supply();
  await assert.rejects(R(players[0], "sponsor", [0, 101, 0]), /sponsoring closed/);
  ch.at(EPOCH + LOBBY + 5n);
  await R(op, "lock", [0]);
  await R(players[0], "sponsor", [0, 101, 0]);
  await R(players[0], "sponsor", [0, 101, 1]);
  for (const _ of [2, 4, 8]) await R(players[1], "sponsor", [0, 102, 2]);
  await assert.rejects(R(players[1], "sponsor", [0, 102, 2]), /no second lives left/);
  assert.equal(await bal(players[0]), rf("98"));
  assert.equal(await bal(players[1]), rf("86"));
  assert.equal(await supply(), start - rf("8"));
  assert.equal(await bal(rewards), rf("8"));
  await assert.rejects(R(players[0], "closeSponsoring", [0]), /operator/);
  await R(op, "closeSponsoring", [0]);
  await assert.rejects(R(players[0], "sponsor", [0, 101, 0]), /sponsoring closed/);
});

test("Locker cosmetics and shouts are gameplay payments: 50% burned, 50% to rewards", async () => {
  const { players, rewards, bal, supply, R } = await setup();
  const start = await supply();
  await R(players[2], "payGameplay", ["0x" + Buffer.from("aura-starfall").toString("hex").padEnd(64, "0"), rf("5")]);
  await assert.rejects(R(players[2], "payGameplay", ["0x" + "00".repeat(32), 0]), /zero/);
  assert.equal(await supply(), start - rf("2.5"));
  assert.equal(await bal(rewards), rf("2.5"));
});

test("a round with fewer than 5 paid entries refunds every entry whole and burns nothing", async () => {
  const { ch, op, players, rounds, bal, supply, R } = await setup();
  const start = await supply();
  ch.at(EPOCH + 1n);
  for (const [i, p] of players.slice(0, 3).entries()) await R(p, "enter", [0, 100 + i]);
  ch.at(EPOCH + LOBBY);
  await R(op, "lock", [0]);
  await assert.rejects(R(op, "settle", [0, [], [], rf("2.4")]), /refund instead/);
  await R(players[4], "refund", [0, [100, 101, 102, 104]]);
  await R(players[4], "refund", [0, [100, 101, 102]]);
  for (const p of players.slice(0, 3)) await R(p, "claim", []);
  for (const p of players.slice(0, 3)) assert.equal(await bal(p), rf("100"));
  assert.equal(await bal(rounds), 0n);
  assert.equal(await supply(), start);
});

test("a round takes at most 50 paid Friends, and every round has its own lobby", async () => {
  const { c, ch, op, token, gens, rounds, players, R } = await setup();
  ch.at(EPOCH + ROUND + 1n);
  await assert.rejects(R(players[0], "enter", [0, 100]), /lobby closed/);
  for (let i = 0; i < 51; i++) {
    const p = addr(0x2000 + i);
    await ch.send(op, token, c.token, "mint", [hex(p), rf("1")]);
    await ch.send(p, token, c.token, "approve", [hex(rounds), rf("1")]);
    await ch.send(op, gens, c.gens, "set", [1000 + i, hex(p)]);
    if (i < 50) await R(p, "enter", [1, 1000 + i]);
    else await assert.rejects(R(p, "enter", [1, 1000 + i]), /round full/);
  }
});
