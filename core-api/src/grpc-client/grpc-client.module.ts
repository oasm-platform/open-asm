import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';

@Module({
  imports: [ConfigModule, ClientsModule.registerAsync([])],
  exports: [ClientsModule],
})
export class GrpcClientModule {}
