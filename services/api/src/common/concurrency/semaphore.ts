/**
 * Caps how many async jobs run at once; the rest wait in arrival order. Used to bound
 * memory-hungry work such as scrypt (128 MB per call) so a burst cannot exhaust the process.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly slots: number) {
    if (!Number.isInteger(slots) || slots < 1) throw new Error('semaphore needs at least 1 slot');
  }

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= this.slots) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      // The slot passes straight to the next waiter, so `active` stays the same.
      if (next) next();
      else this.active -= 1;
    }
  }
}
