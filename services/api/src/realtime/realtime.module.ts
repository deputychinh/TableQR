import { Global, Module } from '@nestjs/common';
import { FloorSnapshotRegistry } from './floor-snapshot.js';
import { RealtimeHub } from './realtime.hub.js';
import { StreamController } from './stream.controller.js';
import { IdentityModule } from '../identity/identity.module.js';

@Global()
@Module({
  imports: [IdentityModule],
  controllers: [StreamController],
  providers: [RealtimeHub, FloorSnapshotRegistry],
  exports: [RealtimeHub, FloorSnapshotRegistry],
})
export class RealtimeModule {}
