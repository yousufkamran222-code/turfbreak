import { useEffect, useRef } from 'preact/hooks';
import type { CoreDef, ModPick } from '../sim/abilities';
import type { Signal } from '@preact/signals';
import type { SideIndex } from '../sim/world';
import type { Hud as HudState } from './session';
import type { SideLook } from './sides';

interface Props {
  hud: HudState;
  cores: readonly [CoreDef, CoreDef];
  looks: readonly [SideLook, SideLook];
  mods: readonly [readonly ModPick[], readonly ModPick[]];
}

/** One Mod icon that flashes each time the Mod fires. */
function ModChip({ pick, pulse }: { pick: ModPick; pulse: Signal<number> | undefined }) {
  const ref = useFlash(pulse?.value ?? 0);
  return (
    <div class="mod-chip" ref={ref} title={`${pick.mod.name} ${pick.level}: ${pick.mod.text(pick.level)}`}>
      <span>{pick.mod.glyph}</span>
      {pick.level > 1 && <sub>{pick.level}</sub>}
    </div>
  );
}

/** Seconds as a clock: 16 becomes "0:16". */
export function clock(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function formatStacks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Restart a CSS animation on an element each time `bump` changes. */
function useFlash(bump: number, cls = 'flash') {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || bump === 0) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }, [bump]);
  return ref;
}

function SideCard({ hud, side, core, look, mods }: { hud: HudState; side: SideIndex; core: CoreDef; look: SideLook; mods: readonly ModPick[] }) {
  const flashRef = useFlash(hud.triggers[side].value);
  return (
    <div class={`card side-${side}`}>
      <div class="card-name" style={{ color: look.color }}>
        {look.name}
      </div>
      <div class="card-stack" ref={flashRef}>
        <span class="stack-label">{core.stackLabel}</span>
        <span class="stack-value">{formatStacks(hud.stacks[side].value)}</span>
      </div>
      <div class="effects">{hud.effects[side].value}</div>
      {mods.length > 0 && (
        <div class="mod-row">
          {mods.map((m, i) => (
            <ModChip key={m.mod.id} pick={m} pulse={hud.modTriggers[side][i]} />
          ))}
        </div>
      )}
    </div>
  );
}

/** VS header, timer and territory bar. */
export function Hud({ hud, cores, looks, mods }: Props) {
  const barRef = useFlash(hud.leadPulse.value, 'thump');
  const a = hud.counts[0].value;
  const b = hud.counts[1].value;
  const share = a + b > 0 ? (a / (a + b)) * 100 : 50;
  const phase = hud.phase.value;
  const secs = hud.secondsLeft.value;
  const stage = hud.stage.value;
  const sudden = phase === 'suddenDeath';
  const timer = stage === 'aiming' ? 'AIM' : sudden ? 'SUDDEN DEATH' : phase === 'ended' ? 'FINAL' : clock(secs);
  const clockShown = stage !== 'aiming' && phase === 'running';
  return (
    <header class="hud">
      <div class="vs">
        <SideCard hud={hud} side={0} core={cores[0]} look={looks[0]} mods={mods[0]} />
        <div class={`timer ${phase === 'running' && secs <= 10 ? 'urgent' : ''} ${clockShown ? '' : 'word'}`}>
          <span class="time">{timer}</span>
          {clockShown && <span class="left-label">LEFT</span>}
        </div>
        <SideCard hud={hud} side={1} core={cores[1]} look={looks[1]} mods={mods[1]} />
      </div>
      <div class="bar" ref={barRef} role="img" aria-label={`${a} cells to ${b}`}>
        <div class="bar-a" style={{ width: `${share}%` }} />
        <div class="bar-half" />
        <span class="bar-count left">{a}</span>
        <span class="bar-count right">{b}</span>
      </div>
    </header>
  );
}
