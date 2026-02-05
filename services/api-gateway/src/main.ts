import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Enable CORS for frontend
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

  const port = process.env.API_PORT || 4000;
  await app.listen(port);

  console.log('🚀 API Gateway started!');
  console.log(`📡 Listening on: http://localhost:${port}`);
  console.log(`🔗 API Docs: http://localhost:${port}/api`);
  console.log(`💚 Health Check: http://localhost:${port}/api/health`);
}

bootstrap();
