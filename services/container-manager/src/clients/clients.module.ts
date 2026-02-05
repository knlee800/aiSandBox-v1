import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ApiGatewayHttpClient } from './api-gateway-http.client';

@Module({
  imports: [HttpModule],
  providers: [ApiGatewayHttpClient],
  exports: [ApiGatewayHttpClient],
})
export class ClientsModule {}
