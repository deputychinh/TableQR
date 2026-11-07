import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { GuestTablesController, TablesController } from './tables.controller.js';
import { TablesService } from './tables.service.js';

/** Restaurant setup: tables and their QR tokens (spec S3). */
@Module({
  imports: [IdentityModule],
  controllers: [TablesController, GuestTablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
