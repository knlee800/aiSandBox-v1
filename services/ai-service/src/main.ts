import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Set global prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 4001;
  await app.listen(port);

  console.log('🤖 AI Service started!');
  console.log(`📡 Listening on: http://localhost:${port}`);
  console.log(`💚 Health Check: http://localhost:${port}/api/health`);
  console.log(`💬 Chat: http://localhost:${port}/api/chat`);
}

bootstrap();
