import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { SETTINGS, type Settings } from './config/settings.js';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
  configureApp(app);
  const settings = app.get<Settings>(SETTINGS);
  await app.listen(settings.PORT, '127.0.0.1');
};

await bootstrap();
