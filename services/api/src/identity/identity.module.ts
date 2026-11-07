import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CLOCK, systemClock } from '../common/clock.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OriginGuard, StaffGuard } from './guards.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    StaffGuard,
    { provide: CLOCK, useValue: systemClock },
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
  exports: [AuthService, StaffGuard, CLOCK],
})
export class IdentityModule {}
