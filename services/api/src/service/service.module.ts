import { Module } from '@nestjs/common';
import { RequestLimits } from '../common/http/request-limits.js';
import { IdentityModule } from '../identity/identity.module.js';
import { MenuModule } from '../menu/menu.module.js';
import { TablesModule } from '../tables/tables.module.js';
import { OrdersController, SessionsController } from './floor.controller.js';
import { GuestController } from './guest.controller.js';
import { OrdersService } from './orders.service.js';
import { SessionsService } from './sessions.service.js';

/** Service floor (design.md "core"): table sessions, guest orders, anomaly hold, waiter review. */
@Module({
  imports: [IdentityModule, TablesModule, MenuModule],
  controllers: [GuestController, SessionsController, OrdersController],
  providers: [SessionsService, OrdersService, RequestLimits],
  exports: [SessionsService, OrdersService],
})
export class ServiceModule {}
