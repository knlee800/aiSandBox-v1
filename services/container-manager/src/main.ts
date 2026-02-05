import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

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

  const port = process.env.PORT || 4002;
  await app.listen(port);

  console.log('🐳 Container Manager started!');
  console.log(`📡 Listening on: http://localhost:${port}`);
  console.log(`💚 Health Check: http://localhost:${port}/api/health`);
  console.log(`📁 Workspaces: /home/vibecode/workspace/aiSandBox/workspaces`);
}

bootstrap();
