import { sql } from 'drizzle-orm';
import type { Database } from '../db/database.module.js';
import {
  NOTIFY_CHANNEL,
  REVOKE_CHANNEL,
  encodeEvent,
  encodeRevocation,
  type RealtimeEvent,
  type Revocation,
} from './domain/event.js';

type Executor = Pick<Database, 'execute'>;

/**
 * Publishes inside the caller's transaction: Postgres delivers NOTIFY only on commit,
 * so a rolled-back change never reaches a screen (ADR 0004).
 */
export const publish = async (executor: Executor, event: RealtimeEvent): Promise<void> => {
  await executor.execute(sql`select pg_notify(${NOTIFY_CHANNEL}, ${encodeEvent(event)})`);
};

/**
 * D4: closes the matching open streams once the caller's transaction commits (disable, new
 * password, new role, restaurant suspension). A rolled-back change closes nothing.
 */
export const publishRevocation = async (
  executor: Executor,
  revocation: Revocation,
): Promise<void> => {
  await executor.execute(sql`select pg_notify(${REVOKE_CHANNEL}, ${encodeRevocation(revocation)})`);
};
