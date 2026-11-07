import { Global, Module } from '@nestjs/common';
import { SETTINGS, loadSettings } from './config/settings.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';

@Global()
@Module({
  providers: [{ provide: SETTINGS, useFactory: () => loadSettings() }],
  exports: [SETTINGS],
})
class SettingsModule {}

@Module({
  imports: [SettingsModule, DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
