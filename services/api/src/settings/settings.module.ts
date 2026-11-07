import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/** House rules and the VietQR bank account (TQR-008, spec S4). */
@Module({
  imports: [IdentityModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
