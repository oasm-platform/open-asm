import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { JobsRegistryModule } from './jobs-registry/jobs-registry.module';
import { RootModule } from './root/root.module';
import { TargetsModule } from './targets/targets.module';
import { UsersModule } from './users/users.module';
import { WorkersModule } from './workers/workers.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ProductsModule } from './products/products.module';

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
    WorkersModule,
    ProductsModule,
  ],
})
export class CombineModule {}
