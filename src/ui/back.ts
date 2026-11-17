import { useEffect, useRef } from 'preact/hooks';

/**
 * Back handling. The platform reports one back press at a time; screens push a
 * handler while mounted and the newest one that returns true consumes it. If
 * none does, the platform performs its default (exit on Android).
 */
const stack: (() => boolean)[] = [];

export function handleBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!()) return true;
  }
  return false;
}

/** Register `fn` as this screen's back handler for as long as it is mounted (or `active`). */
export function useBack(fn: () => boolean, active = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const h = (): boolean => ref.current();
    stack.push(h);
    return () => {
      const i = stack.lastIndexOf(h);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
