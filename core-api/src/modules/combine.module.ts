import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { RootModule } from './root/root.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { JobsRegistryModule } from './jobs-registry/jobs-registry.module';

@Module({
  imports: [
    AuthModule.forRoot({
      disableExceptionFilter: true,
    }),

    WorkspacesModule,
    UsersModule,
    RootModule,
    JobsRegistryModule,
  ],
})
export class CombineModule {}
