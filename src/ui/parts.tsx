import { cores } from '../content/cores';
import type { CoreDef, ModDef, ModPick, RunnerShape } from '../sim/abilities';
import type { BuildEntry } from '../run/run';
import { buildPicks, MAX_MODS } from '../run/run';

const TAU = Math.PI * 2;

function poly(n: number, rot: number, r = 1): string {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * TAU;
    return `${(50 + 42 * r * Math.cos(a)).toFixed(1)},${(50 + 42 * r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function star(): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const r = i % 2 === 0 ? 1.1 : 0.5;
    return `${(50 + 40 * r * Math.cos(a)).toFixed(1)},${(50 + 40 * r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const SHAPE_POINTS: Record<Exclude<RunnerShape, 'circle'>, string> = {
  diamond: poly(4, 0),
  hexagon: poly(6, Math.PI / 6),
  triangle: poly(3, -Math.PI / 2),
  square: poly(4, Math.PI / 4),
  pentagon: poly(5, -Math.PI / 2),
  octagon: poly(8, Math.PI / 8),
  star: star(),
};

/** A Core's runner shape in its colour, so Cores are never told apart by colour alone. */
export function ShapeIcon({ shape, color, size = 40 }: { shape: RunnerShape; color: string; size?: number }) {
  return (
    <svg class="shape" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {shape === 'circle' ? (
        <circle cx="50" cy="50" r="40" fill={color} />
      ) : (
        <polygon points={SHAPE_POINTS[shape]} fill={color} stroke="#fff" stroke-opacity="0.5" stroke-width="2" />
      )}
    </svg>
  );
}

export function Hearts({ hearts, max = 3 }: { hearts: number; max?: number }) {
  const total = Math.max(max, hearts);
  return (
    <span class="hearts" role="img" aria-label={`${hearts} hearts`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={i < hearts ? 'heart full' : 'heart empty'}>
          {i < hearts ? '♥' : '♡'}
        </span>
      ))}
    </span>
  );
}

/** Small Mod icon with its level, tinted by rarity. */
export function ModIcon({ mod, level, size = 'md' }: { mod: ModDef; level: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span class={`mod-icon ${size} ${mod.rarity}`} title={`${mod.name} ${level}: ${mod.text(level)}`}>
      <span class="g">{mod.glyph}</span>
      {level > 1 && <sub>{level}</sub>}
    </span>
  );
}

/** A row of Mod icons for a build, optionally padded with empty slots up to the cap. */
export function BuildRow({ build, slots = false, size = 'md' }: { build: readonly BuildEntry[]; slots?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const picks: ModPick[] = buildPicks(build);
  const empty = slots ? Math.max(0, MAX_MODS - picks.length) : 0;
  return (
    <div class="build-row">
      {picks.map((p) => (
        <ModIcon key={p.mod.id} mod={p.mod} level={p.level} size={size} />
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} class={`mod-icon ${size} empty`} />
      ))}
    </div>
  );
}

export function coreName(core: CoreDef): string {
  return `${core.colorName} ${core.name}`.toUpperCase();
}

export function findCore(id: string): CoreDef | undefined {
  return cores.find((c) => c.id === id);
}

/** A build as a list of "glyph name level" buttons. Tapping one reports it, for the popover. */
export function ModList({
  build,
  active,
  onTap,
}: {
  build: readonly BuildEntry[];
  active?: string | null;
  onTap(id: string): void;
}) {
  const picks: ModPick[] = buildPicks(build);
  if (picks.length === 0) return <div class="mod-list none">No Mods</div>;
  return (
    <div class="mod-list">
      {picks.map((p) => (
        <button
          key={p.mod.id}
          type="button"
          class={`mod-line ${p.mod.rarity} ${active === p.mod.id ? 'on' : ''}`}
          data-mod={p.mod.id}
          onClick={(e) => {
            e.stopPropagation();
            onTap(p.mod.id);
          }}
        >
          <span class="g">{p.mod.glyph}</span>
          <span class="n">{p.mod.name}</span>
          <span class="l">{p.level}</span>
        </button>
      ))}
    </div>
  );
}
