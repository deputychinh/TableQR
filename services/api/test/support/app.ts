import { Test } from '@nestjs/testing';
import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
import type { LogSink } from '../../src/common/logging/log-sink.js';
import { LOG_SINK } from '../../src/common/logging/log-sink.js';

export interface TestApp {
  app: INestApplication<App>;
  logs: Record<string, unknown>[];
}

/** Builds the real app (same configuration as main.ts) with logs captured in memory. */
export const createTestApp = async (extra: ModuleMetadata = {}): Promise<TestApp> => {
  const logs: Record<string, unknown>[] = [];
  const sink: LogSink = { write: (entry) => logs.push(entry) };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extra.imports ?? [])],
    controllers: extra.controllers ?? [],
  })
    .overrideProvider(LOG_SINK)
    .useValue(sink)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return { app: app as unknown as INestApplication<App>, logs };
};
