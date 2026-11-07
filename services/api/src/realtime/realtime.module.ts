import { Global, Module } from '@nestjs/common';
import { RealtimeHub } from './realtime.hub.js';
import { StreamController } from './stream.controller.js';
import { StreamGate } from './stream-gate.js';
import { IdentityModule } from '../identity/identity.module.js';

@Global()
@Module({
  imports: [IdentityModule],
  controllers: [StreamController],
  providers: [RealtimeHub, StreamGate],
  exports: [RealtimeHub, StreamGate],
})
export class RealtimeModule {}
