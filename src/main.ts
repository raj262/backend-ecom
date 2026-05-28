import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { join } from 'path';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import hpp from 'hpp';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // --- Security middleware (order matters) --------------------------
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(compression());
  // Strips `$` and `.` from req.body/query/params → blocks Mongo operator injection.
  app.use(mongoSanitize());
  // Drops duplicate query keys → prevents HTTP Parameter Pollution.
  app.use(hpp());

  // --- CORS ----------------------------------------------------------
  const corsRaw = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  const corsList = corsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsList.length > 1 ? corsList : corsList[0],
    credentials: true,
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  Logger.log(`Lumière API listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
