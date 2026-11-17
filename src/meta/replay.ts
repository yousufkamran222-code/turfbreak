/**
 * Replay codes (MASTER_PROMPT 6.7). A match is fully determined by its seed,
 * both Cores, both builds, its twist and the inputs applied to it (the sim logs
 * the rival's controller inputs too), so a short binary record is enough to
 * play it back with no controllers at all.
 *
 * Layout, all varints unless noted: format, major, minor, seed, ruleset, core A, core B,
 * per side: Mod count then (Mod index * 4 + level) each, twist flags and fields,
 * input count then per input: step delta, side * 3 + type (launch=0, ultimate=1, tactical=2), tactical choice index, and,
 * for a launch, dx and dy as float64 (a replay must be bit-exact). A 16-bit
 * checksum closes it. Indices count the sorted id lists, so the code is only
 * valid for the same major.minor build; patch releases never change content.
 */
import { limits, integer, validBuild, validInputs, validTwist } from '../sim/validation';
import { tuning } from '../content/tuning';
import { cores } from '../content/cores';
import { mods } from '../content/mods';
import type { BuildEntry } from '../run/run';
import { buildPicks } from '../run/run';
import type { InputRecord } from '../sim/input';
import type { MatchConfig, MatchTwist, Ruleset } from '../sim/world';

const FORMAT = 2;
const RULESETS: readonly Ruleset[] = ['classic', 'recharge', 'tactical'];
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export interface ReplayData {
  ruleset?: Ruleset;
  /** Build version that recorded it, "major.minor.patch". */
  version: string;
  seed: number;
  cores: [string, string];
  builds: [BuildEntry[], BuildEntry[]];
  twist: MatchTwist | null;
  inputs: InputRecord[];
}

export type DecodeResult = { ok: true; data: ReplayData } | { ok: false; error: string };

const coreIds = cores.map((c) => c.id).sort();
const modIds = mods.map((m) => m.id).sort();

/** "major.minor" of a version string; anything unparsable counts as 0.0. */
export function majorMinor(version: string): [number, number] {
  const p = version.split('.').map((x) => Number.parseInt(x, 10));
  return [Number.isFinite(p[0]) ? p[0]! : 0, Number.isFinite(p[1]) ? p[1]! : 0];
}

class Writer {
  readonly bytes: number[] = [];
  varint(v: number): void {
    let n = Math.max(0, Math.floor(v));
    while (n >= 0x80) {
      this.bytes.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.bytes.push(n);
  }
  f64(v: number): void {
    const b = new Uint8Array(new Float64Array([v]).buffer);
    for (const x of b) this.bytes.push(x);
  }
}

class Reader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}
  get done(): boolean {
    return this.i >= this.b.length;
  }
  varint(): number {
    let n = 0;
    let mul = 1;
    for (let k = 0; k < 8; k++) {
      if (this.i >= this.b.length) throw new Error('short');
      const x = this.b[this.i++]!;
      n += (x & 0x7f) * mul;
      if (x < 0x80) return n;
      mul *= 0x80;
    }
    throw new Error('long');
  }
  f64(): number {
    if (this.i + 8 > this.b.length) throw new Error('short');
    const v = new Float64Array(this.b.slice(this.i, this.i + 8).buffer)[0]!;
    this.i += 8;
    if (!Number.isFinite(v)) throw new Error('float');
    return v;
  }
}

function checksum(bytes: ArrayLike<number>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 0x01000193);
  return (h ^ (h >>> 16)) & 0xffff;
}

function toBase64Url(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64[n & 63]!;
  }
  return out;
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    let got = 0;
    for (let k = 0; k < 4 && i + k < s.length; k++) {
      n |= B64.indexOf(s[i + k]!) << (18 - 6 * k);
      got++;
    }
    out.push((n >> 16) & 255);
    if (got > 2) out.push((n >> 8) & 255);
    if (got > 3) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

const TWIST_FIELDS = ['extraPrimaries', 'startShare', 'startShields', 'durationSeconds', 'pickupEverySeconds'] as const;

export function encodeReplay(d: ReplayData): string {
  const w = new Writer();
  const [major, minor] = majorMinor(d.version);
  w.varint(FORMAT);
  w.varint(major);
  w.varint(minor);
  w.varint(d.seed);
  w.varint(RULESETS.indexOf(d.ruleset ?? 'classic'));
  for (const id of d.cores) w.varint(Math.max(0, coreIds.indexOf(id)));
  for (const build of d.builds) {
    const known = build.filter((e) => modIds.includes(e.id));
    w.varint(known.length);
    for (const e of known) w.varint(modIds.indexOf(e.id) * 4 + Math.max(1, Math.min(3, e.level)));
  }
  const t = d.twist;
  let flags = 0;
  TWIST_FIELDS.forEach((k, i) => {
    if (t && t[k] !== undefined) flags |= 1 << i;
  });
  w.varint(flags);
  if (t) {
    if (t.extraPrimaries) for (const n of t.extraPrimaries) w.varint(n);
    if (t.startShare !== undefined) w.f64(t.startShare);
    if (t.startShields) for (const n of t.startShields) w.varint(n);
    if (t.durationSeconds !== undefined) w.f64(t.durationSeconds);
    if (t.pickupEverySeconds !== undefined) w.f64(t.pickupEverySeconds);
  }
  w.varint(d.inputs.length);
  let prev = 0;
  for (const inp of d.inputs) {
    w.varint(inp.step - prev);
    prev = inp.step;
    w.varint(inp.side * 3 + (inp.type === 'ultimate' ? 1 : inp.type === 'tactical' ? 2 : 0));
    if (inp.type === 'tactical') w.varint(['speed', 'shield', 'recharge'].indexOf(inp.choice));
    if (inp.type === 'launch') {
      w.f64(inp.dx);
      w.f64(inp.dy);
    }
  }
  const sum = checksum(w.bytes);
  w.bytes.push(sum & 255, sum >> 8);
  return toBase64Url(w.bytes);
}

const BAD = 'That replay code is damaged or incomplete.';

/** Parse a code. Never throws; a code from another major.minor version gets a friendly refusal. */
export function decodeReplay(code: string, currentVersion: string = APP_VERSION): DecodeResult {
  try {
    if (code.length > limits.codeLength) return { ok: false, error: BAD };
    const bytes = fromBase64Url(code.trim());
    if (!bytes || bytes.length < 8) return { ok: false, error: BAD };
    const body = bytes.slice(0, -2);
    if (checksum(body) !== (bytes[bytes.length - 2]! | (bytes[bytes.length - 1]! << 8))) return { ok: false, error: BAD };
    const r = new Reader(body);
    if (r.varint() !== FORMAT) return { ok: false, error: 'That replay code is from a different kind of game build.' };
    const major = r.varint();
    const minor = r.varint();
    const [cm, cn] = majorMinor(currentVersion);
    if (major !== cm || minor !== cn) {
      return {
        ok: false,
        error: `That replay was recorded on version ${major}.${minor}, and this is ${cm}.${cn}. Replays only play back on the same version.`,
      };
    }
    const seed = r.varint();
    const ruleset = RULESETS[r.varint()];
    if (!ruleset) return { ok: false, error: BAD };
    const ca = coreIds[r.varint()];
    const cb = coreIds[r.varint()];
    if (!ca || !cb) return { ok: false, error: BAD };
    const builds: BuildEntry[][] = [];
    for (let s = 0; s < 2; s++) {
      const n = r.varint();
      if (n > limits.mods) return { ok: false, error: BAD };
      const b: BuildEntry[] = [];
      for (let i = 0; i < n; i++) {
        const v = r.varint();
        const id = modIds[Math.floor(v / 4)];
        const level = v % 4;
        if (!id || level < 1) return { ok: false, error: BAD };
        b.push({ id, level });
      }
      builds.push(b);
    }
    const flags = r.varint();
    if (flags > 31) return { ok: false, error: BAD };
    let twist: MatchTwist | null = null;
    if (flags !== 0) {
      const t: { -readonly [K in keyof MatchTwist]: MatchTwist[K] } = {};
      if (flags & 1) t.extraPrimaries = [r.varint(), r.varint()];
      if (flags & 2) t.startShare = r.f64();
      if (flags & 4) t.startShields = [r.varint(), r.varint()];
      if (flags & 8) t.durationSeconds = r.f64();
      if (flags & 16) t.pickupEverySeconds = r.f64();
      twist = t;
    }
    const count = r.varint();
    if (count > limits.inputs) return { ok: false, error: BAD };
    const inputs: InputRecord[] = [];
    let step = 0;
    for (let i = 0; i < count; i++) {
      step += r.varint();
      const v = r.varint();
      const side = Math.floor(v / 3) as 0 | 1;
      if (v > 5) return { ok: false, error: BAD };
      if (v % 3 === 1) inputs.push({ step, side, type: 'ultimate' });
      else if (v % 3 === 2) {
        const choice = (['speed', 'shield', 'recharge'] as const)[r.varint()];
        if (!choice || ruleset !== 'tactical') return { ok: false, error: BAD };
        inputs.push({ step, side, type: 'tactical', choice });
      } else inputs.push({ step, side, type: 'launch', dx: r.f64(), dy: r.f64() });
    }
    if (!r.done || !integer(seed, 0, 0xffffffff) || (twist && !validTwist(twist)) ||
        !builds.every((b) => validBuild(b, modIds)) || !validInputs(inputs, twist?.durationSeconds ?? tuning.match.durationSeconds, ruleset)) return { ok: false, error: BAD };
    return {
      ok: true,
      data: { version: `${major}.${minor}.0`, ruleset, seed, cores: [ca, cb], builds: [builds[0]!, builds[1]!], twist, inputs },
    };
  } catch {
    return { ok: false, error: BAD };
  }
}

/** The headless/UI match config that plays a replay back: recorded inputs, no controllers. */
export function replayConfig(d: ReplayData): MatchConfig | null {
  const a = cores.find((c) => c.id === d.cores[0]);
  const b = cores.find((c) => c.id === d.cores[1]);
  if (!a || !b || !integer(d.seed, 0, 0xffffffff) || (d.twist && !validTwist(d.twist)) ||
      !d.builds.every((v) => validBuild(v, modIds)) || !validInputs(d.inputs, d.twist?.durationSeconds ?? tuning.match.durationSeconds, d.ruleset)) return null;
  return {
    seed: d.seed,
    ruleset: d.ruleset ?? 'classic',
    cores: [a, b],
    controllers: [null, null],
    inputs: d.inputs,
    mods: [buildPicks(d.builds[0]), buildPicks(d.builds[1])],
    ...(d.twist ? { twist: d.twist } : {}),
  };
}

/** `?replay=CODE` from a location search string, or null. */
export function replayParam(search: string): string | null {
  const m = /[?&]replay=([A-Za-z0-9_-]+)/.exec(search);
  return m ? m[1]! : null;
}
