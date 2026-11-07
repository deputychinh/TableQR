import { Global, Module } from '@nestjs/common';
import { SETTINGS, loadSettings } from './config/settings.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { TablesModule } from './tables/tables.module.js';
import { AppLogger } from './common/logging/app-logger.js';
import { LOG_SINK, stdoutSink } from './common/logging/log-sink.js';

@Global()
@Module({
  providers: [
    { provide: SETTINGS, useFactory: () => loadSettings() },
    { provide: LOG_SINK, useValue: stdoutSink },
    AppLogger,
  ],
  exports: [SETTINGS, AppLogger],
})
class CoreModule {}

/** Feature modules; each parallel item adds one line here. */
const FEATURE_MODULES = [IdentityModule, TablesModule];

@Module({
  imports: [CoreModule, DatabaseModule, ...FEATURE_MODULES],
  controllers: [HealthController],
})
export class AppModule {}
