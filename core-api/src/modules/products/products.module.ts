import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { WorkspaceProduct } from './entities/workspace-product.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, WorkspaceProduct, Workspace])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
