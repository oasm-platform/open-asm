import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { RootModule } from './root/root.module';

@Module({
  imports: [
    AuthModule.forRoot({
      disableExceptionFilter: true,
    }),
    RootModule,
  ],
})
export class CombineModule {}
