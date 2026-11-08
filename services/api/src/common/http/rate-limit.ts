/**
 * In-memory fixed-window counter per key (e.g. client address). One process only: with several
 * API instances each keeps its own count, so the effective limit is `limit × instances`
 * (docs/security.md). Old windows are pruned when the map is full, so memory stays bounded.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts one hit; false when the key is over its limit in the current window. */
  hit(key: string, nowMs: number): boolean {
    const current = this.windows.get(key);
    if (current === undefined || nowMs - current.start >= this.windowMs) {
      if (current === undefined && this.windows.size >= this.maxKeys) this.prune(nowMs);
      this.windows.set(key, { start: nowMs, count: 1 });
      return this.limit >= 1;
    }
    current.count += 1;
    return current.count <= this.limit;
  }

  get size(): number {
    return this.windows.size;
  }

  private prune(nowMs: number): void {
    for (const [key, window] of this.windows) {
      if (nowMs - window.start >= this.windowMs) this.windows.delete(key);
    }
    // Still full of live windows: drop the oldest entry rather than grow without bound.
    if (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest !== undefined) this.windows.delete(oldest);
    }
  }
}
