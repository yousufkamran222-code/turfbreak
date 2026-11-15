import { useEffect, useRef } from 'preact/hooks';
import type { CoreDef } from '../sim/abilities';
import type { SideIndex } from '../sim/world';
import type { Hud as HudState } from './session';
import type { SideLook } from './sides';

interface Props {
  hud: HudState;
  cores: readonly [CoreDef, CoreDef];
  looks: readonly [SideLook, SideLook];
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

function SideCard({ hud, side, core, look }: { hud: HudState; side: SideIndex; core: CoreDef; look: SideLook }) {
  const flashRef = useFlash(hud.triggers[side].value);
  return (
    <div class={`card side-${side}`}>
      <div class="card-name" style={{ color: look.color }}>
        {look.colorWord}
        <br />
        {look.coreWord}
      </div>
      <div class="card-stack" ref={flashRef}>
        <span class="stack-label">{core.stackLabel}</span>
        <span class="stack-value">{formatStacks(hud.stacks[side].value)}</span>
      </div>
    </div>
  );
}

/** VS header, timer and territory bar. */
export function Hud({ hud, cores, looks }: Props) {
  const barRef = useFlash(hud.leadPulse.value, 'thump');
  const a = hud.counts[0].value;
  const b = hud.counts[1].value;
  const share = a + b > 0 ? (a / (a + b)) * 100 : 50;
  const phase = hud.phase.value;
  const secs = hud.secondsLeft.value;
  const timer = phase === 'suddenDeath' ? 'SUDDEN DEATH' : phase === 'ended' ? 'FINAL' : `${secs}`;
  return (
    <header class="hud">
      <div class="vs">
        <SideCard hud={hud} side={0} core={cores[0]} look={looks[0]} />
        <div class={`timer ${phase === 'running' && secs <= 10 ? 'urgent' : ''}`}>{timer}</div>
        <SideCard hud={hud} side={1} core={cores[1]} look={looks[1]} />
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
