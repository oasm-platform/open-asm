import { BaseEntity } from 'src/common/entities/base.entity';
import { Workspace } from 'src/modules/workspaces/entities/workspace.entity';
import { Entity, ManyToOne, Column } from 'typeorm';
import { Product } from './product.entity';

@Entity('workspace_products')
export class WorkspaceProduct extends BaseEntity {
  @Column()
  workspaceId: string;

  @Column()
  productId: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.workspaceProducts, {
    onDelete: 'CASCADE',
  })
  workspace: Workspace;

  @ManyToOne(() => Product, (product) => product.workspaceProducts, {
    onDelete: 'CASCADE',
  })
  product: Product;
}
