import { Global, Module } from '@nestjs/common';
import { RealtimeHub } from './realtime.hub.js';
import { StreamController } from './stream.controller.js';
import { IdentityModule } from '../identity/identity.module.js';

@Global()
@Module({
  imports: [IdentityModule],
  controllers: [StreamController],
  providers: [RealtimeHub],
  exports: [RealtimeHub],
})
export class RealtimeModule {}
