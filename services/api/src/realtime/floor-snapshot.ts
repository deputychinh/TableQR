import { Injectable } from '@nestjs/common';
import type { TenantId } from '../common/tenant.js';

export type FloorSnapshotPart = (tenant: TenantId) => Promise<unknown>;

/**
 * The floor stream's snapshot is built from parts other modules register under their own key
 * (`ready` from the kitchen's serve board; held orders, bills… from later items), so each feature
 * owns its slice and the stream controller stays one line per audience.
 */
@Injectable()
export class FloorSnapshotRegistry {
  private readonly parts = new Map<string, FloorSnapshotPart>();

  register(key: string, part: FloorSnapshotPart): void {
    if (key === 'at' || this.parts.has(key)) {
      throw new Error(`floor snapshot part "${key}" is already taken`);
    }
    this.parts.set(key, part);
  }

  async build(tenant: TenantId, now: Date): Promise<Record<string, unknown>> {
    const entries = await Promise.all(
      [...this.parts].map(async ([key, part]) => [key, await part(tenant)] as const),
    );
    return { at: now.toISOString(), ...Object.fromEntries(entries) };
  }
}
