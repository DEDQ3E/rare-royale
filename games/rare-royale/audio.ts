/** Rare Royale's sound: an arena broadcast made entirely in code (Web Audio), with no samples and no shared kit.
 *
 * Palette: a stadium crowd built from vowel formants over noise with a stadium slap-back echo; a score in D minor
 * (i–VI–III–VII) that builds in layers with the battle (pad, bass, drums, arpeggio, lead hook, final-duel heartbeat
 * and risers); plucked-string weapons (Karplus–Strong), ring-modulated star wands, inharmonic bells for loot and
 * sponsor items, a flame whoosh for every burn, an airship drone and a storm siren. The viewer's own Friend gets its
 * own cues (hits, near misses, shield blocks, storm zaps, a heartbeat when low), and the score ducks under them.
 *
 * Nothing plays before `unlock()` is called from a player gesture. Muted, paused or hidden: the context is suspended. */

export type Cue =
  | "ui" | "enter" | "burn" | "tick" | "tick-hi" | "go" | "jump" | "land"
  | "shot-fists" | "shot-slingshot" | "shot-hammer" | "shot-bow" | "shot-wand" | "hit" | "downed" | "out"
  | "loot" | "heal" | "shield" | "revive" | "zone" | "decision" | "bounty" | "win" | "lose"
  | "parachute" | "pickup-weapon" | "pickup-armor" | "pickup-bandage" | "pickup-gold" | "hurt" | "whiff" | "tink" | "zap"
  | "warn" | "top10" | "final" | "airdrop" | "tab";
export type Scene = "off" | "lobby" | "battle" | "results";
/** `far` (0 near to 1 at the edge of hearing) muffles a sound with distance. */
export type PlayOptions = Readonly<{ gain?: number; pan?: number; far?: number }>;
/** The score's chords in D minor, one per bar: i, VI, III, VII. */
const CHORDS: readonly (readonly number[])[] = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
const ROOTS = [38, 34, 41, 36];
/** The lead hook, eight eighths per bar (0 = rest), over the same four chords. */
const HOOK: readonly (readonly number[])[] = [[74, 0, 77, 74, 81, 0, 79, 77], [77, 0, 74, 70, 74, 0, 77, 79], [81, 0, 77, 72, 77, 0, 76, 77], [79, 0, 76, 72, 76, 0, 74, 72]];

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export function createRoyaleAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode, sfx: GainNode, music: GainNode, echo: GainNode, crowdGain: GainNode, droneGain: GainNode, stormGain: GainNode;
  const MUSIC_LEVEL = 0.3;
  let musicOn = true, heartbeat = false, nextBeatAt = 0;
  let noise: AudioBuffer;
  let muted = false, paused = false, hidden = typeof document !== "undefined" && document.hidden;
  let scene: Scene = "off", intensity = 0, nextBeat = 0, beat = 0, timer = 0;
  const strings = new Map<string, AudioBuffer>();

  /* ---------- building blocks ---------- */
  function out(pan = 0, far = 0): AudioNode {
    let node: AudioNode = sfx;
    if (pan) { const p = ctx!.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(node); node = p; }
    if (far > 0.05) { const lp = ctx!.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 9000 - Math.min(1, far) * 7500; lp.connect(node); node = lp; }
    return node;
  }
  /** Pulls the score down for a moment so an important cue reads clearly. */
  function duck(depth = 0.4, hold = 0.8) {
    if (!ctx || !musicOn) return;
    const g = music.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(MUSIC_LEVEL * depth, t, 0.04); g.setTargetAtTime(MUSIC_LEVEL, t + hold, 0.35);
  }
  /** Also sends a node to the stadium echo. */
  function echoed(node: AudioNode, amount = 0.35) { const g = ctx!.createGain(); g.gain.value = amount; node.connect(g).connect(echo); }
  function env(t: number, peak: number, attack: number, decay: number, dest: AudioNode) {
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest); return g;
  }
  function osc(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, dest: AudioNode, attack = 0.005) {
    const o = ctx!.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(env(t, peak, attack, dur, dest)); o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }
  function hiss(t: number, dur: number, peak: number, dest: AudioNode, type: BiquadFilterType, f0: number, f1 = f0, q = 1, attack = 0.004) {
    const s = ctx!.createBufferSource(), f = ctx!.createBiquadFilter();
    s.buffer = noise; s.loopStart = 0; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f).connect(env(t, peak, attack, dur, dest)); s.start(t, Math.random() * 1.5); s.stop(t + attack + dur + 0.05);
  }
  /** A plucked string (Karplus–Strong), rendered once per pitch and damping and cached; `tone` softens it. */
  function pluck(t: number, freq: number, damping: number, dur: number, peak: number, dest: AudioNode, tone = 5000) {
    const key = `${freq}:${damping}:${dur}`;
    let buf = strings.get(key);
    if (!buf) {
      const sr = ctx!.sampleRate, n = Math.round(sr / freq), len = Math.round(sr * dur), y = new Float32Array(len);
      for (let i = 0; i < n; i++) y[i] = Math.random() * 2 - 1;
      for (let i = n; i < len; i++) y[i] = damping * 0.5 * (y[i - n] + y[i - n - 1 < 0 ? 0 : i - n - 1]);
      buf = ctx!.createBuffer(1, len, sr); buf.copyToChannel(y, 0); strings.set(key, buf);
    }
    const s = ctx!.createBufferSource(), g = ctx!.createGain(), hp = ctx!.createBiquadFilter(), lp = ctx!.createBiquadFilter();
    s.buffer = buf; hp.type = "highpass"; hp.frequency.value = 70; lp.type = "lowpass"; lp.frequency.value = tone;
    // The tail fades out instead of stopping on a hard edge.
    g.gain.setValueAtTime(peak, t); g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.15);
    s.connect(hp).connect(lp).connect(g).connect(dest); s.start(t);
  }
  /** A struck bell: inharmonic partials with their own decays. */
  function bell(t: number, f: number, peak: number, dur: number, dest: AudioNode) {
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([ratio, level], i) => osc(t, "sine", f * ratio, f * ratio, dur / (1 + i * 0.7), peak * level, dest, 0.002));
  }
  /** Ring modulation: a carrier times a modulator, for the star wand's metallic chirp. */
  function ring(t: number, c0: number, c1: number, m: number, dur: number, peak: number, dest: AudioNode) {
    const car = ctx!.createOscillator(), mod = ctx!.createOscillator(), vca = ctx!.createGain();
    car.type = "triangle"; car.frequency.setValueAtTime(c0, t); car.frequency.exponentialRampToValueAtTime(c1, t + dur);
    mod.frequency.value = m; vca.gain.value = 0; mod.connect(vca.gain);
    car.connect(vca).connect(env(t, peak, 0.004, dur, dest));
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }
  /** A brass-like voice: two detuned saws through an opening then closing lowpass. */
  function brass(t: number, note: number, dur: number, peak: number, dest: AudioNode) {
    const lp = ctx!.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2;
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.06); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = env(t, peak, 0.03, dur, dest); lp.connect(g);
    for (const det of [-9, 9]) { const o = ctx!.createOscillator(); o.type = "sawtooth"; o.frequency.value = midi(note); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
  }
  /** A crowd reaction: noise shaped by vowel formants, swelling and fading. */
  function crowd(t: number, vowel: "ah" | "oh" | "ee", peak: number, dur: number) {
    const formants = vowel === "ah" ? [730, 1090, 2440] : vowel === "oh" ? [570, 840, 2410] : [300, 2290, 3010];
    const g = ctx!.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(sfx); echoed(g, 0.3);
    for (const [i, f] of formants.entries()) {
      const s = ctx!.createBufferSource(), bp = ctx!.createBiquadFilter(), lvl = ctx!.createGain();
      s.buffer = noise; s.loop = true; bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 7; lvl.gain.value = [1, 0.6, 0.35][i];
      s.connect(bp).connect(lvl).connect(g); s.start(t, Math.random()); s.stop(t + dur + 0.1);
    }
  }

  /* ---------- cues ---------- */
  function play(cue: Cue, o: PlayOptions = {}) {
    if (!ctx || muted || paused || hidden || ctx.state !== "running") return false;
    const t = ctx.currentTime + 0.01, v = o.gain ?? 1, d = out(o.pan, o.far);
    if (["go", "win", "lose", "revive", "bounty", "final", "top10", "hurt", "airdrop"].includes(cue)) duck(cue === "hurt" ? 0.6 : 0.4, cue === "win" || cue === "lose" ? 2.5 : 0.8);
    switch (cue) {
      case "ui": hiss(t, 0.05, 0.25 * v, d, "bandpass", 1800, 1800, 8); osc(t, "sine", 880, 880, 0.05, 0.08 * v, d); break;
      case "enter":
        osc(t, "sine", 90, 50, 0.18, 0.5 * v, d); hiss(t, 0.08, 0.2 * v, d, "highpass", 3000);
        bell(t + 0.12, midi(79), 0.18 * v, 0.9, d); bell(t + 0.24, midi(84), 0.16 * v, 1.1, d); break;
      case "burn":
        hiss(t, 0.7, 0.35 * v, d, "bandpass", 280, 2600, 2, 0.08);
        for (let i = 0; i < 7; i++) hiss(t + 0.08 + Math.random() * 0.5, 0.012, 0.25 * v, d, "highpass", 4000);
        bell(t + 0.05, midi(64), 0.1 * v, 0.8, d); break;
      case "tick": osc(t, "sine", 2200, 2200, 0.03, 0.18 * v, d, 0.001); hiss(t, 0.02, 0.12 * v, d, "bandpass", 2500, 2500, 10); break;
      case "tick-hi": osc(t, "sine", 3300, 3300, 0.05, 0.22 * v, d, 0.001); hiss(t, 0.03, 0.15 * v, d, "bandpass", 3500, 3500, 10); break;
      case "go": {
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 1.2; bp.connect(d);
        for (const n of [57, 64, 69]) { const vib = osc(t, "sawtooth", midi(n), midi(n) * 1.01, 0.9, 0.26 * v, bp, 0.02); vib.detune.setValueAtTime(-30, t); vib.detune.linearRampToValueAtTime(0, t + 0.12); }
        crowd(t + 0.1, "ah", 0.5 * v, 1.6); break;
      }
      case "jump": hiss(t, 0.6, 0.9 * v, d, "lowpass", 300, 2200, 1, 0.1); break;
      case "land": osc(t, "sine", 95, 42, 0.2, 0.5 * v, d); hiss(t, 0.12, 0.2 * v, d, "lowpass", 900, 200); break;
      case "shot-fists": hiss(t, 0.07, 0.4 * v, d, "lowpass", 1000, 300); osc(t, "sine", 130, 70, 0.08, 0.3 * v, d); break;
      case "shot-slingshot": pluck(t, [330, 370, 392][Math.floor(Math.random() * 3)], 0.93, 0.22, 0.3 * v, d, 3500); hiss(t + 0.03, 0.12, 0.12 * v, d, "highpass", 2500, 6000); break;
      case "shot-hammer": {
        const ws = ctx.createWaveShaper(), curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
        const after = ctx.createGain(); after.gain.value = 0.55;
        ws.curve = curve; ws.connect(after).connect(d);
        osc(t, "sine", 75, 38, 0.22, 0.42 * v, ws); bell(t, 520, 0.05 * v, 0.3, d); break;
      }
      case "shot-bow": pluck(t, [196, 220, 247][Math.floor(Math.random() * 3)], 0.965, 0.35, 0.5 * v, d, 2600); hiss(t + 0.02, 0.2, 0.12 * v, d, "bandpass", 1500, 4500, 2); break;
      case "shot-wand": ring(t, 1100, 2600, 310, 0.22, 0.22 * v, d); hiss(t, 0.18, 0.06 * v, d, "highpass", 5000); break;
      case "hit": {
        const ws = ctx.createWaveShaper(), curve = new Float32Array(64);
        for (let i = 0; i < 64; i++) curve[i] = Math.round((i / 32 - 1) * 3) / 3;
        ws.curve = curve; ws.connect(d); hiss(t, 0.05, 2.5 * v, ws, "bandpass", 1600, 700, 1.5); osc(t, "sine", 180, 90, 0.05, 0.12 * v, d); break;
      }
      case "downed": {
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.5); lp.connect(d);
        osc(t, "sawtooth", 330, 110, 0.5, 0.25 * v, lp); break;
      }
      case "out": osc(t, "sine", 70, 35, 0.6, 0.45 * v, d); crowd(t + 0.05, "oh", 0.28 * v, 1.2); break;
      case "loot": hiss(t, 0.12, 0.15 * v, d, "bandpass", 400, 250, 3); [84, 88, 91].forEach((n, i) => bell(t + 0.08 + i * 0.07, midi(n), 0.09 * v, 0.6, d)); break;
      case "heal": hiss(t, 0.4, 0.12 * v, d, "bandpass", 500, 2500, 3, 0.1); osc(t + 0.1, "sine", midi(72), midi(72), 0.4, 0.12 * v, d, 0.03); osc(t + 0.2, "sine", midi(79), midi(79), 0.5, 0.12 * v, d, 0.03); break;
      case "shield": {
        const o = osc(t, "sine", 380, 950, 0.35, 0.25 * v, d, 0.01), lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 22; depth.gain.value = 40; lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(t + 0.45);
        bell(t + 0.3, midi(86), 0.07 * v, 0.5, d); break;
      }
      case "revive": hiss(t, 0.8, 0.2 * v, d, "bandpass", 200, 3000, 4, 0.5); [67, 71, 74, 79].forEach((n, i) => brass(t + 0.5 + i * 0.09, n, 0.35, 0.12 * v, d)); crowd(t + 0.6, "ah", 0.3 * v, 1.4); break;
      case "zone": {
        const o = osc(t, "sine", 640, 330, 1.6, 0.16 * v, d, 0.15), lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 5; depth.gain.value = 18; lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(t + 1.8);
        osc(t, "sine", 48, 40, 1.4, 0.3 * v, d, 0.2); break;
      }
      case "decision": { const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.connect(d); osc(t, "square", 1318, 1318, 0.06, 0.25 * v, bp, 0.002); osc(t + 0.1, "square", 1760, 1760, 0.08, 0.25 * v, bp, 0.002); break; }
      case "bounty": bell(t, midi(88), 0.14 * v, 0.7, d); bell(t + 0.06, midi(93), 0.12 * v, 0.9, d); hiss(t, 0.3, 0.1 * v, d, "bandpass", 600, 2600, 2, 0.05); break;
      case "win": crowd(t, "ah", 0.5 * v, 3.2); [[67, 0], [72, 0.18], [76, 0.36], [79, 0.54], [84, 0.8]].forEach(([n, at]) => brass(t + at, n, n === 84 ? 1.2 : 0.3, 0.12 * v, d)); break;
      case "lose": brass(t, 64, 0.45, 0.09 * v, d); brass(t + 0.45, 60, 0.9, 0.08 * v, d); crowd(t + 0.2, "oh", 0.15 * v, 1.2); break;
      case "parachute": hiss(t, 0.18, 0.35 * v, d, "lowpass", 1400, 300, 1.5, 0.01); osc(t, "sine", 180, 90, 0.2, 0.25 * v, d); hiss(t + 0.15, 1.2, 0.08 * v, d, "bandpass", 700, 500, 0.7, 0.2); break;
      case "pickup-weapon": hiss(t, 0.05, 0.2 * v, d, "highpass", 3000); ring(t + 0.03, 2400, 3200, 820, 0.25, 0.12 * v, d); pluck(t + 0.02, 660, 0.96, 0.3, 0.18 * v, d); break;
      case "pickup-armor": osc(t, "square", 220, 180, 0.06, 0.1 * v, d); bell(t + 0.02, 330, 0.12 * v, 0.4, d); hiss(t, 0.08, 0.15 * v, d, "bandpass", 2400, 2400, 4); break;
      case "pickup-bandage": hiss(t, 0.22, 0.25 * v, d, "bandpass", 2500, 5000, 3, 0.01); osc(t + 0.2, "sine", midi(79), midi(79), 0.3, 0.08 * v, d, 0.02); break;
      case "pickup-gold": [84, 88, 91, 96].forEach((n, i) => bell(t + i * 0.06, midi(n), 0.1 * v, 0.9, d)); crowd(t + 0.1, "oh", 0.12 * v, 1); break;
      case "hurt": osc(t, "sine", 150, 60, 0.14, 0.55 * v, d); hiss(t, 0.06, 0.3 * v, d, "bandpass", 900, 500, 2); crowd(t + 0.02, "ah", 0.08 * v, 0.25); break;
      case "whiff": hiss(t, 0.16, 0.7 * v, d, "bandpass", 3500, 900, 3, 0.02); break;
      case "tink": bell(t, 1850, 0.14 * v, 0.35, d); hiss(t, 0.04, 0.12 * v, d, "highpass", 6000); break;
      case "zap": { const ws = ctx.createWaveShaper(), c = new Float32Array(32); for (let i = 0; i < 32; i++) c[i] = Math.sign(i - 16) * Math.min(1, Math.abs(i - 16) / 6); ws.curve = c; ws.connect(d); osc(t, "sawtooth", 90, 70, 0.12, 0.15 * v, ws); hiss(t, 0.08, 0.2 * v, d, "highpass", 2500); break; }
      case "warn": osc(t, "triangle", 988, 988, 0.08, 0.12 * v, d, 0.004); osc(t + 0.14, "triangle", 740, 740, 0.1, 0.12 * v, d, 0.004); break;
      case "top10": { brass(t, 62, 0.25, 0.08 * v, d); brass(t + 0.22, 69, 0.5, 0.09 * v, d); crowd(t + 0.1, "ah", 0.2 * v, 1.4); break; }
      case "final": {
        [0, 0.9].forEach(at => { osc(t + at, "sine", 62, 55, 1.6, 0.4 * v, d, 0.004); bell(t + at, 98, 0.12 * v, 2.2, d); });
        hiss(t + 0.2, 2.2, 0.12 * v, d, "bandpass", 300, 3200, 3, 1.8); crowd(t + 0.3, "oh", 0.25 * v, 2.2); break;
      }
      case "airdrop": hiss(t, 0.5, 0.18 * v, d, "bandpass", 3000, 600, 2, 0.05); bell(t + 0.35, midi(81), 0.1 * v, 0.6, d); break;
      case "tab": osc(t, "sine", 1320, 1320, 0.03, 0.06 * v, d, 0.001); break;
    }
    return true;
  }

  /* ---------- the score: layers that arrive as the field shrinks ---------- */
  /** A soft pad chord: detuned triangles through a slowly opening lowpass. */
  function pad(t: number, notes: readonly number[], dur: number, peak: number) {
    const lp = ctx!.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.6); lp.connect(music);
    const g = ctx!.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.4); g.gain.setValueAtTime(peak, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(lp);
    for (const n of notes) for (const det of [-7, 7]) { const o = ctx!.createOscillator(); o.type = "triangle"; o.frequency.value = midi(n); o.detune.value = det; o.connect(g); o.start(t); o.stop(t + dur + 0.05); }
  }
  /** A pulse-wave lead: two detuned squares through a bright, closing filter. */
  function lead(t: number, n: number, dur: number, peak: number) {
    const lp = ctx!.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(900, t + dur); lp.connect(music); echoed(lp, 0.25);
    const g = env(t, peak, 0.01, dur, lp);
    for (const det of [-6, 6]) { const o = ctx!.createOscillator(); o.type = "square"; o.frequency.value = midi(n); o.detune.value = det; o.connect(g); o.start(t); o.stop(t + dur + 0.05); }
  }
  function musicStep(t: number, i: number, step: number) {
    const k = i % 16, bar = Math.floor(i / 16), chord = bar % 4, e = scene === "battle" ? intensity : 0, final = scene === "battle" && intensity >= 0.94;
    const kick = (gain: number) => osc(t, "sine", 120, 42, 0.2, gain, music, 0.002);
    if (k === 0) pad(t, CHORDS[chord], step * 16, scene === "lobby" ? 0.05 : 0.04 + e * 0.02);
    if (scene === "lobby") {
      // The lobby: a slow pulse, the root on the half-bar, a shaker and a bell motif every other bar.
      if (k === 0 || k === 8) kick(0.32);
      if (k % 8 === 0) { const lp = ctx!.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320; lp.connect(music); osc(t, "sawtooth", midi(ROOTS[chord]), midi(ROOTS[chord]), step * 6, 0.12, lp, 0.02); }
      if (k % 2 === 1) hiss(t, 0.03, 0.03, music, "highpass", 8000);
      if (bar % 2 === 1 && (k === 0 || k === 3 || k === 6)) bell(t, midi(CHORDS[chord][[2, 1, 0][k / 3]] + 24), 0.035, 1.2, music);
      return;
    }
    // The battle: kick and hats from the start; snare, 16th hats, a bass arpeggio and the hook arrive with the tension.
    if (final) { if (k === 0 || k === 3) kick(0.5); } else if (k % 4 === 0) kick(0.45);
    if (!final && k === 14 && e > 0.55) kick(0.3);
    if ((k === 4 || k === 12) && e > 0.2) { hiss(t, 0.12, 0.22, music, "bandpass", 1800, 1200, 0.8); osc(t, "triangle", 210, 160, 0.08, 0.13, music); }
    if (k % 2 === 0) hiss(t, 0.03, k % 4 === 2 ? 0.09 : 0.05, music, "highpass", 7000);
    if (e > 0.4 && k % 2 === 1) hiss(t, 0.02, 0.04, music, "highpass", 9000);
    const root = ROOTS[chord];
    if (k % 2 === 0) {
      const lp = ctx!.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 4;
      lp.frequency.setValueAtTime(450 + e * 900, t); lp.frequency.exponentialRampToValueAtTime(140, t + 0.18); lp.connect(music);
      const n = e > 0.55 ? root + [0, 12, 7, 12, 0, 12, 10, 12][k / 2] : root;
      osc(t, "sawtooth", midi(n), midi(n), 0.2, 0.2, lp, 0.004);
    }
    if (e > 0.3 && k % 4 === 2) pluck(t, midi(CHORDS[chord][(k / 4) % 3 | 0] + 12), 0.96, 0.35, 0.05, music, 2500);
    if (e > 0.7 && k % 2 === 0) { const n = HOOK[chord][k / 2]; if (n) lead(t, final ? n + 12 : n, step * 1.6, 0.045); }
    // A riser into every fourth bar near the end.
    if (e > 0.8 && k === 0 && bar % 4 === 3) hiss(t, step * 16, 0.06, music, "bandpass", 400, 4000, 2, step * 14);
  }
  function schedule() {
    if (!ctx || ctx.state !== "running") return;
    // The viewer's heartbeat when their Friend is low, whatever else is playing.
    if (heartbeat) {
      if (nextBeatAt < ctx.currentTime) nextBeatAt = ctx.currentTime + 0.05;
      while (nextBeatAt < ctx.currentTime + 0.3) { osc(nextBeatAt, "sine", 70, 40, 0.12, 0.35, sfx, 0.004); osc(nextBeatAt + 0.18, "sine", 62, 38, 0.1, 0.25, sfx, 0.004); nextBeatAt += 0.85; }
    }
    if (scene === "off" || scene === "results" || !musicOn) return;
    const bpm = scene === "battle" ? 108 + intensity * 28 : 84, step = 60 / bpm / 4;
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
    while (nextBeat < ctx.currentTime + 0.25) { musicStep(nextBeat, beat, step); nextBeat += step; beat += 1; }
  }
  function beds() {
    const c = ctx!, t = c.currentTime;
    // Crowd murmur: three formant bands over looping noise, gently wandering.
    crowdGain = c.createGain(); crowdGain.gain.value = 0; crowdGain.connect(master);
    for (const [f, q, lvl, rate] of [[520, 3, 1, 0.13], [1150, 4, 0.5, 0.21], [2600, 5, 0.25, 0.17]]) {
      const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
      s.buffer = noise; s.loop = true; bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q; g.gain.value = lvl;
      lfo.frequency.value = rate; depth.gain.value = f * 0.12; lfo.connect(depth).connect(bp.frequency);
      s.connect(bp).connect(g).connect(crowdGain); s.start(t, Math.random()); lfo.start(t);
    }
    // Airship: two beating saws, a propeller flutter, low-passed.
    droneGain = c.createGain(); droneGain.gain.value = 0;
    const dlp = c.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 320; dlp.connect(droneGain); droneGain.connect(master);
    const flutter = c.createGain(), prop = c.createOscillator(), propDepth = c.createGain();
    flutter.gain.value = 0.6; prop.frequency.value = 13; propDepth.gain.value = 0.4; prop.connect(propDepth).connect(flutter.gain); flutter.connect(dlp); prop.start(t);
    for (const f of [55, 56.3]) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(flutter); o.start(t); }
    // Storm: low noise with a slow wobble.
    stormGain = c.createGain(); stormGain.gain.value = 0;
    const s = c.createBufferSource(), slp = c.createBiquadFilter(), wob = c.createOscillator(), wobDepth = c.createGain();
    s.buffer = noise; s.loop = true; s.playbackRate.value = 0.35; slp.type = "lowpass"; slp.frequency.value = 380; slp.Q.value = 3;
    wob.frequency.value = 0.7; wobDepth.gain.value = 180; wob.connect(wobDepth).connect(slp.frequency); wob.start(t);
    s.connect(slp).connect(stormGain).connect(master); s.start(t);
  }
  function level(g: GainNode | undefined, v: number, tc = 0.4) { if (ctx && g) g.gain.setTargetAtTime(v, ctx.currentTime, tc); }
  function applyScene() {
    level(crowdGain, scene === "lobby" ? 0.09 : scene === "battle" ? 0.05 + intensity * 0.08 : scene === "results" ? 0.14 : 0, 0.8);
    if (scene !== "battle") { level(droneGain, 0); level(stormGain, 0); }
  }

  /* ---------- lifecycle ---------- */
  function sync() {
    if (!ctx) return;
    const run = !muted && !paused && !hidden;
    if (run && ctx.state === "suspended") void ctx.resume();
    if (!run && ctx.state === "running") void ctx.suspend();
  }
  const onVisibility = () => { hidden = document.hidden; sync(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

  return {
    /** Starts audio. Call from a click or key press. Resolves to false when audio is unavailable. */
    async unlock(): Promise<boolean> {
      try {
        if (!ctx) {
          const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) return false;
          const c = new AC(); ctx = c;
          master = c.createGain(); master.gain.value = 0.55;
          const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
          master.connect(comp).connect(c.destination);
          sfx = c.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
          music = c.createGain(); music.gain.value = musicOn ? MUSIC_LEVEL : 0; music.connect(master);
          // The stadium echo: a filtered feedback delay on a send.
          echo = c.createGain(); echo.gain.value = 1;
          const dl = c.createDelay(1), fb = c.createGain(), elp = c.createBiquadFilter(), wet = c.createGain();
          dl.delayTime.value = 0.23; fb.gain.value = 0.3; elp.type = "lowpass"; elp.frequency.value = 1800; wet.gain.value = 0.5;
          echo.connect(dl); dl.connect(elp).connect(fb).connect(dl); elp.connect(wet).connect(master);
          noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
          const n = noise.getChannelData(0); for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
          beds(); applyScene();
          timer = window.setInterval(schedule, 90);
        }
        sync();
        if (ctx.state === "suspended" && !muted && !paused && !hidden) await ctx.resume();
        return ctx.state === "running" || muted || paused || hidden;
      } catch { return false; }
    },
    play,
    setMuted(m: boolean) { muted = m; sync(); },
    /** Score on or off; effects and the crowd keep playing. */
    setMusic(on: boolean) { musicOn = on; if (ctx) level(music, on ? MUSIC_LEVEL : 0, 0.2); },
    /** A heartbeat while the viewer's Friend is low on HP. */
    setHeartbeat(on: boolean) { heartbeat = on; },
    setPaused(p: boolean) { paused = p; sync(); },
    /** Which bed plays, and how tense the battle is (0 at the drop, 1 in the final circles). */
    setScene(s: Scene, battleIntensity = 0) {
      const changed = s !== scene; scene = s; intensity = Math.max(0, Math.min(1, battleIntensity));
      if (changed) beat = 0;
      applyScene();
    },
    /** Airship drone (0 to 1) and storm rumble (0 to 1) for what the camera sees. */
    setAmbience(drone: number, storm: number) { if (scene === "battle") { level(droneGain, drone * 0.35, 0.3); level(stormGain, storm * 0.5, 0.3); } },
    dispose() {
      window.clearInterval(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      void ctx?.close(); ctx = null;
    },
  };
}
export type RoyaleAudio = ReturnType<typeof createRoyaleAudio>;
