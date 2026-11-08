import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { KitchenController } from './kitchen.controller.js';
import { KitchenStreamController } from './kitchen-stream.controller.js';
import { ServeController } from './serve.controller.js';
import { KitchenService } from './kitchen.service.js';

/** Kitchen station queues (S9, TQR-014) and the waiter ready list (S10, TQR-015). */
@Module({
  imports: [IdentityModule],
  controllers: [KitchenController, ServeController, KitchenStreamController],
  providers: [KitchenService],
})
export class KitchenModule {}
