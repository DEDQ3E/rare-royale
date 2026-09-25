/** Rare Royale's sound: an arena broadcast made entirely in code (Web Audio), with no samples and no shared kit.
 *
 * Palette: a stadium crowd built from vowel formants over noise, a driving drum-and-bass bed that grows with the
 * battle, plucked-string weapons (Karplus–Strong), ring-modulated star wands, inharmonic bells for loot and
 * sponsor items, a flame whoosh for every burn, an airship drone and a storm siren.
 *
 * Nothing plays before `unlock()` is called from a player gesture. Muted, paused or hidden: the context is suspended. */

export type Cue =
  | "ui" | "enter" | "burn" | "tick" | "tick-hi" | "go" | "jump" | "land"
  | "shot-fists" | "shot-slingshot" | "shot-hammer" | "shot-bow" | "shot-wand" | "hit" | "downed" | "out"
  | "loot" | "heal" | "shield" | "revive" | "zone" | "decision" | "bounty" | "win" | "lose";
export type Scene = "off" | "lobby" | "battle" | "results";
export type PlayOptions = Readonly<{ gain?: number; pan?: number }>;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export function createRoyaleAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode, sfx: GainNode, music: GainNode, crowdGain: GainNode, droneGain: GainNode, stormGain: GainNode;
  let noise: AudioBuffer;
  let muted = false, paused = false, hidden = typeof document !== "undefined" && document.hidden;
  let scene: Scene = "off", intensity = 0, nextBeat = 0, beat = 0, timer = 0;
  const strings = new Map<string, AudioBuffer>();

  /* ---------- building blocks ---------- */
  function out(pan = 0): AudioNode {
    if (!pan) return sfx;
    const p = ctx!.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(sfx); return p;
  }
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
  /** A plucked string (Karplus–Strong), rendered once per pitch and damping and cached. */
  function pluck(t: number, freq: number, damping: number, dur: number, peak: number, dest: AudioNode) {
    const key = `${freq}:${damping}:${dur}`;
    let buf = strings.get(key);
    if (!buf) {
      const sr = ctx!.sampleRate, n = Math.round(sr / freq), len = Math.round(sr * dur), y = new Float32Array(len);
      for (let i = 0; i < n; i++) y[i] = Math.random() * 2 - 1;
      for (let i = n; i < len; i++) y[i] = damping * 0.5 * (y[i - n] + y[i - n - 1 < 0 ? 0 : i - n - 1]);
      buf = ctx!.createBuffer(1, len, sr); buf.copyToChannel(y, 0); strings.set(key, buf);
    }
    const s = ctx!.createBufferSource(), g = ctx!.createGain(); s.buffer = buf; g.gain.value = peak;
    s.connect(g).connect(dest); s.start(t);
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
    g.connect(sfx);
    for (const [i, f] of formants.entries()) {
      const s = ctx!.createBufferSource(), bp = ctx!.createBiquadFilter(), lvl = ctx!.createGain();
      s.buffer = noise; s.loop = true; bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 7; lvl.gain.value = [1, 0.6, 0.35][i];
      s.connect(bp).connect(lvl).connect(g); s.start(t, Math.random()); s.stop(t + dur + 0.1);
    }
  }

  /* ---------- cues ---------- */
  function play(cue: Cue, o: PlayOptions = {}) {
    if (!ctx || muted || paused || hidden || ctx.state !== "running") return false;
    const t = ctx.currentTime + 0.01, v = o.gain ?? 1, d = out(o.pan);
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
        for (const n of [57, 64, 69]) { const vib = osc(t, "sawtooth", midi(n), midi(n) * 1.01, 0.9, 0.12 * v, bp, 0.02); vib.detune.setValueAtTime(-30, t); vib.detune.linearRampToValueAtTime(0, t + 0.12); }
        crowd(t + 0.1, "ah", 0.35 * v, 1.6); break;
      }
      case "jump": hiss(t, 0.6, 0.3 * v, d, "lowpass", 300, 2200, 1, 0.1); break;
      case "land": osc(t, "sine", 95, 42, 0.2, 0.5 * v, d); hiss(t, 0.12, 0.2 * v, d, "lowpass", 900, 200); break;
      case "shot-fists": hiss(t, 0.07, 0.4 * v, d, "lowpass", 1000, 300); osc(t, "sine", 130, 70, 0.08, 0.3 * v, d); break;
      case "shot-slingshot": pluck(t, 330, 0.93, 0.25, 0.5 * v, d); hiss(t + 0.03, 0.12, 0.12 * v, d, "highpass", 2500, 6000); break;
      case "shot-hammer": {
        const ws = ctx.createWaveShaper(), curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
        ws.curve = curve; ws.connect(d);
        osc(t, "sine", 75, 38, 0.22, 0.7 * v, ws); bell(t, 520, 0.08 * v, 0.35, d); break;
      }
      case "shot-bow": pluck(t, 147, 0.985, 0.6, 0.55 * v, d); hiss(t + 0.02, 0.2, 0.1 * v, d, "bandpass", 1500, 4500, 2); break;
      case "shot-wand": ring(t, 1100, 2600, 310, 0.22, 0.22 * v, d); hiss(t, 0.18, 0.06 * v, d, "highpass", 5000); break;
      case "hit": {
        const ws = ctx.createWaveShaper(), curve = new Float32Array(64);
        for (let i = 0; i < 64; i++) curve[i] = Math.round((i / 32 - 1) * 3) / 3;
        ws.curve = curve; ws.connect(d); hiss(t, 0.05, 0.4 * v, ws, "bandpass", 1600, 700, 1.5); break;
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
      case "revive": hiss(t, 0.8, 0.2 * v, d, "bandpass", 200, 3000, 4, 0.5); [67, 71, 74, 79].forEach((n, i) => brass(t + 0.5 + i * 0.09, n, 0.35, 0.07 * v, d)); crowd(t + 0.6, "ah", 0.3 * v, 1.4); break;
      case "zone": {
        const o = osc(t, "sine", 640, 330, 1.6, 0.16 * v, d, 0.15), lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 5; depth.gain.value = 18; lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(t + 1.8);
        osc(t, "sine", 48, 40, 1.4, 0.3 * v, d, 0.2); break;
      }
      case "decision": { const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.connect(d); osc(t, "square", 1318, 1318, 0.06, 0.25 * v, bp, 0.002); osc(t + 0.1, "square", 1760, 1760, 0.08, 0.25 * v, bp, 0.002); break; }
      case "bounty": bell(t, midi(88), 0.14 * v, 0.7, d); bell(t + 0.06, midi(93), 0.12 * v, 0.9, d); hiss(t, 0.3, 0.1 * v, d, "bandpass", 600, 2600, 2, 0.05); break;
      case "win": crowd(t, "ah", 0.5 * v, 3.2); [[67, 0], [72, 0.18], [76, 0.36], [79, 0.54], [84, 0.8]].forEach(([n, at]) => brass(t + at, n, n === 84 ? 1.2 : 0.3, 0.12 * v, d)); break;
      case "lose": brass(t, 64, 0.45, 0.09 * v, d); brass(t + 0.45, 60, 0.9, 0.08 * v, d); crowd(t + 0.2, "oh", 0.15 * v, 1.2); break;
    }
    return true;
  }

  /* ---------- the bed: crowd, drums and bass, airship drone, storm ---------- */
  const BASS = [38, 38, 41, 43, 38, 38, 36, 33];
  function drumStep(t: number, i: number) {
    const k = i % 16, energy = scene === "battle" ? intensity : 0;
    if (k % 4 === 0) osc(t, "sine", 120, 45, 0.18, 0.5, music, 0.002);
    if (scene === "battle" && k === 14 && energy > 0.55) osc(t, "sine", 120, 45, 0.15, 0.35, music, 0.002);
    if (scene === "battle" && (k === 4 || k === 12) && energy > 0.2) { hiss(t, 0.12, 0.25, music, "bandpass", 1800, 1200, 0.8); osc(t, "triangle", 210, 160, 0.08, 0.15, music); }
    if (scene === "battle" && k % 2 === 0) hiss(t, 0.03, k % 4 === 2 ? 0.1 : 0.05, music, "highpass", 7000);
    if (scene === "battle" && energy > 0.75 && k % 2 === 1) hiss(t, 0.02, 0.05, music, "highpass", 9000);
    if (k % 2 === 0) {
      const lp = ctx!.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 4;
      lp.frequency.setValueAtTime(scene === "battle" ? 500 + energy * 900 : 380, t); lp.frequency.exponentialRampToValueAtTime(140, t + 0.18); lp.connect(music);
      osc(t, "sawtooth", midi(BASS[Math.floor(i / 8) % BASS.length]), midi(BASS[Math.floor(i / 8) % BASS.length]), 0.2, scene === "battle" ? 0.22 : 0.14, lp, 0.004);
    }
  }
  function schedule() {
    if (!ctx || ctx.state !== "running" || scene === "off" || scene === "results") return;
    const bpm = scene === "battle" ? 112 + intensity * 20 : 84, step = 60 / bpm / 4;
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
    while (nextBeat < ctx.currentTime + 0.25) { drumStep(nextBeat, beat); nextBeat += step; beat += 1; }
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
          music = c.createGain(); music.gain.value = 0.32; music.connect(master);
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
