/** Ordered, coalescing writes. A failed latest value stays pending until retry. */
export class Persistence {
  private readonly pending = new Map<string, string>();
  private readonly active = new Map<string, Promise<void>>();
  private readonly failed = new Set<string>();
  constructor(private readonly write: (key: string, value: string) => Promise<void>, private readonly status: (failed: boolean) => void = () => {}) {}

  set(key: string, value: string): void {
    this.pending.set(key, value);
    this.failed.delete(key);
    this.start(key);
  }

  private start(key: string): void {
    if (this.active.has(key) || !this.pending.has(key)) return;
    const work = async (): Promise<void> => {
      while (this.pending.has(key)) {
        const value = this.pending.get(key)!;
        this.pending.delete(key);
        try {
          await this.write(key, value);
          this.failed.delete(key);
        } catch {
          if (this.pending.has(key)) continue;
          this.pending.set(key, value);
          this.failed.add(key);
          this.status(true);
          return;
        }
      }
      this.status(this.failed.size > 0);
    };
    // Defer execution so active is registered even for synchronously throwing writers.
    const promise = Promise.resolve().then(work).finally(() => {
      this.active.delete(key);
      if (this.pending.has(key) && !this.failed.has(key)) this.start(key);
    });
    this.active.set(key, promise);
  }

  async flush(): Promise<void> {
    for (const key of this.pending.keys()) this.start(key);
    while (this.active.size > 0) await Promise.all([...this.active.values()]);
  }
}
