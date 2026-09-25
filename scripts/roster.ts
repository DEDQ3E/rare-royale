/** Builds games/rare-royale/roster.json: real, hardwired (Generation 1-6) Rare Friends that fill the arena.
 *
 * Method: a seeded random sample of token IDs in the minted range 1..100,000 (hardwired Friends live there;
 * higher IDs are Generation 0), reading only each sampled ID's public `generation`. It is a bounded sample, not a
 * collection scan, and it never looks up anyone's wallet: no owner addresses are read or stored.
 * Artwork comes from the SDK's pinned sprite registry, unmodified.
 * Usage: node scripts/roster.ts [size=300] */

import { writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { GENERATION_SPRITE_MANIFEST as M, createGenerationSpriteReader } from "@rarefriends/friendsdk/sprites";
import { createRng, hash32 } from "../games/rare-royale/engine/rng.ts";

const SIZE = Number(process.argv[2] ?? 300);
const MAX_ID = 100_000, BATCH = 200, MAX_SAMPLES = 6_000;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const client = createPublicClient({ transport: http(M.rpcUrl, { retryCount: 3, timeout: 20_000 }) });
const abi = parseAbi(["function generation(uint256 tokenId) view returns (uint8)"]);

const rng = createRng(hash32("rare-royale-roster", 1));
const seen = new Set<number>(), found: { id: bigint; gen: number }[] = [];
let sampled = 0;
while (found.length < SIZE && sampled < MAX_SAMPLES) {
  const ids: bigint[] = [];
  while (ids.length < BATCH) { const id = 1 + rng.int(MAX_ID); if (!seen.has(id)) { seen.add(id); ids.push(BigInt(id)); } }
  sampled += ids.length;
  const gens = await client.multicall({
    multicallAddress: MULTICALL3, allowFailure: true,
    contracts: ids.map(id => ({ address: M.generations, abi, functionName: "generation" as const, args: [id] as const })),
  });
  gens.forEach((g, i) => { if (g.status === "success" && g.result >= 1 && g.result <= 6 && found.length < SIZE) found.push({ id: ids[i], gen: g.result }); });
  console.log(`sampled ${sampled}, hardwired ${found.length}`);
}

const reader = createGenerationSpriteReader(client);
const friends: unknown[] = [];
const hex = (b: bigint) => b.toString(16).padStart(64, "0");
for (let i = 0; i < found.length; i += 8) {
  const arts = await Promise.all(found.slice(i, i + 8).map(f => reader.read(f.id)));
  arts.forEach((art, k) => {
    const f = found[i + k];
    // Keep three canonical clips: idle facing the camera (Colossus has no front view: its right side), walk left, walk right.
    const idleStart = art.familyId === 6 ? 24 : 0;
    const wanted = [...art.frames.slice(idleStart, idleStart + 8), ...art.frames.slice(48, 56), ...art.frames.slice(56, 64)];
    const unique = [...new Set(wanted.map(hex))];
    const index = wanted.map(b => unique.indexOf(hex(b)));
    friends.push({ id: String(f.id), gen: f.gen, family: art.familyName, seed: art.seed, frames: unique, idle: index.slice(0, 8), walkLeft: index.slice(8, 16), walkRight: index.slice(16, 24) });
  });
  console.log(`artwork ${Math.min(i + 8, found.length)}/${found.length}`);
}

const byGen = [1, 2, 3, 4, 5, 6].map(g => `Gen ${g}: ${found.filter(f => f.gen === g).length}`).join(", ");
writeFileSync(new URL("../games/rare-royale/roster.json", import.meta.url), JSON.stringify({
  version: 1,
  source: {
    chainId: M.chainId, generations: M.generations, registry: M.registry,
    method: `Seeded random sample of ${sampled} token IDs in 1..${MAX_ID}; kept Generation 1-6. Public generation reads only; no owners read or stored.`,
    builtAt: new Date().toISOString(), counts: byGen,
  },
  friends,
}))
console.log(`wrote ${friends.length} Friends (${byGen})`);
