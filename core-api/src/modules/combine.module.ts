import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { RootModule } from './root/root.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { JobsRegistryModule } from './jobs-registry/jobs-registry.module';
import { AssetsModule } from './assets/assets.module';
import { TargetsModule } from './targets/targets.module';

@Module({
  imports: [
    AuthModule.forRoot({
      disableExceptionFilter: true,
    }),
    TargetsModule,
    WorkspacesModule,
    UsersModule,
    RootModule,
    JobsRegistryModule,
    AssetsModule,
  ],
})
export class CombineModule {}
