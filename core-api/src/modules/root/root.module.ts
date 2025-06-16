import { Module } from '@nestjs/common';
import { RootService } from './root.service';
import { RootController } from './root.controller';

@Module({
  controllers: [RootController],
  providers: [RootService],
})
export class RootModule {}
