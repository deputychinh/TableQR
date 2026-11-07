import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { SETTINGS, type Settings } from '../config/settings.js';
import { AppLogger } from '../common/logging/app-logger.js';
import {
  NOTIFY_CHANNEL,
  decodeEvent,
  reconnectDelayMs,
  type RealtimeEvent,
} from './domain/event.js';

export type Listener = (event: RealtimeEvent | 'resync') => void;

interface Subscription {
  restaurantId: string;
  topics: ReadonlySet<string>;
  listener: Listener;
}

/**
 * One dedicated LISTEN connection per process fans NOTIFY events out to in-process subscribers,
 * filtered by restaurant and topic (ADR 0004). On reconnect every subscriber gets `resync`.
 */
@Injectable()
export class RealtimeHub implements OnModuleInit, OnApplicationShutdown {
  private readonly subscriptions = new Set<Subscription>();
  private client: pg.Client | undefined;
  private stopped = false;
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(SETTINGS) private readonly settings: Settings,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.client?.end().catch(() => undefined);
  }

  subscribe(restaurantId: string, topics: Iterable<string>, listener: Listener): () => void {
    const subscription: Subscription = { restaurantId, topics: new Set(topics), listener };
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  get subscriberCount(): number {
    return this.subscriptions.size;
  }

  /** Test hook: drop the LISTEN connection as a network failure would. */
  async simulateDisconnect(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    await client?.end().catch(() => undefined);
    this.scheduleReconnect();
  }

  private dispatch(event: RealtimeEvent | 'resync'): void {
    for (const subscription of this.subscriptions) {
      if (
        event === 'resync' ||
        (subscription.restaurantId === event.restaurantId && subscription.topics.has(event.topic))
      ) {
        try {
          subscription.listener(event);
        } catch (error: unknown) {
          this.logger.error('realtime_listener_failed', {
            error: error instanceof Error ? error.name : typeof error,
          });
        }
      }
    }
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({
      connectionString: this.settings.TQR_DATABASE_URL,
      keepAlive: true,
      connectionTimeoutMillis: 3000,
    });
    client.on('notification', (message) => {
      const event = decodeEvent(message.payload);
      if (event) this.dispatch(event);
    });
    client.on('error', () => {
      // 'end' follows; reconnect happens there
    });
    client.on('end', () => {
      if (this.client === client) {
        this.client = undefined;
        this.scheduleReconnect();
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
      const wasReconnect = this.attempt > 0;
      this.client = client;
      this.attempt = 0;
      if (wasReconnect) this.dispatch('resync');
    } catch (error: unknown) {
      await client.end().catch(() => undefined);
      this.logger.warn('realtime_listen_failed', {
        error: error instanceof Error ? error.name : typeof error,
        attempt: this.attempt,
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = reconnectDelayMs(this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }
}
