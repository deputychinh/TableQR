import { Global, Module } from '@nestjs/common';
import { SETTINGS, loadSettings } from './config/settings.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { MenuModule } from './menu/menu.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { TablesModule } from './tables/tables.module.js';
import { StaffModule } from './staff/staff.module.js';
import { AdminModule } from './admin/admin.module.js';
import { BillingModule } from './billing/billing.module.js';
import { BookingModule } from './booking/booking.module.js';
import { ServiceModule } from './service/service.module.js';
import { KitchenModule } from './kitchen/kitchen.module.js';
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
// One module per line, so parallel merges stay additive.
// prettier-ignore
const FEATURE_MODULES = [
  IdentityModule,
  SettingsModule,
  TablesModule,
  MenuModule,
  StaffModule,
  AdminModule,
  BillingModule,
  BookingModule,
  ServiceModule,
  KitchenModule,
];

@Module({
  imports: [CoreModule, DatabaseModule, RealtimeModule, ...FEATURE_MODULES],
  controllers: [HealthController],
})
export class AppModule {}
