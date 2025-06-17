import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RootController } from './root.controller';
import { RootService } from './root.service';

@Module({
  imports: [UsersModule],
  controllers: [RootController],
  providers: [RootService],
})
export class RootModule {}
