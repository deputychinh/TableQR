import { Global, Module } from '@nestjs/common';
import { SETTINGS, loadSettings } from './config/settings.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
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

@Module({
  imports: [CoreModule, DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
