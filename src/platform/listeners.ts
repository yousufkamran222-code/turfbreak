/** A small ordered listener list. Later subscribers run first, like a back stack. */
export class Listeners<T extends (...args: never[]) => unknown> {
  private list: T[] = [];

  add(cb: T): () => void {
    this.list.push(cb);
    return () => {
      this.list = this.list.filter((c) => c !== cb);
    };
  }

  /** Call every listener, newest first. */
  emit(...args: Parameters<T>): void {
    for (let i = this.list.length - 1; i >= 0; i--) this.list[i]?.(...args);
  }

  /** Call listeners newest first until one returns true. */
  emitUntilHandled(...args: Parameters<T>): boolean {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i]?.(...args) === true) return true;
    }
    return false;
  }
}
