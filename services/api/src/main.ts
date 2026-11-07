import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { SETTINGS, type Settings } from './config/settings.js';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
  const settings = app.get<Settings>(SETTINGS);
  app.enableCors({ origin: settings.TQR_WEB_ORIGINS, credentials: true });
  app.enableShutdownHooks();
  await app.listen(settings.PORT, '127.0.0.1');
};

await bootstrap();
