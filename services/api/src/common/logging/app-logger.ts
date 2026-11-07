import { Inject, Injectable } from '@nestjs/common';
import { SETTINGS, type Settings } from '../../config/settings.js';
import { LOG_SINK, type LogSink } from './log-sink.js';
import { redact } from './redact.js';

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_RANK: Readonly<Record<Level, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Structured logger: every entry is redacted before it reaches the sink. */
@Injectable()
export class AppLogger {
  private readonly minRank: number;

  constructor(
    @Inject(LOG_SINK) private readonly sink: LogSink,
    @Inject(SETTINGS) settings: Settings,
  ) {
    this.minRank = LEVEL_RANK[settings.TQR_LOG_LEVEL];
  }

  info(msg: string, fields: Record<string, unknown> = {}): void {
    this.log('info', msg, fields);
  }

  warn(msg: string, fields: Record<string, unknown> = {}): void {
    this.log('warn', msg, fields);
  }

  error(msg: string, fields: Record<string, unknown> = {}): void {
    this.log('error', msg, fields);
  }

  private log(level: Level, msg: string, fields: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < this.minRank) {
      return;
    }
    this.sink.write(redact({ time: new Date().toISOString(), level, msg, ...fields }));
  }
}
