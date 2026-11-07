import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
