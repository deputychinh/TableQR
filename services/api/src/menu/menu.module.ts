import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { GuestMenuController } from './guest-menu.controller.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';

/** Restaurant setup: stations, categories, menu items and the public guest menu (S2). */
@Module({
  imports: [IdentityModule],
  controllers: [MenuController, GuestMenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
