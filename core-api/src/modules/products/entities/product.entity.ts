import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { WorkspaceProduct } from 'src/modules/products/entities/workspace-product.entity';

@Entity('products')
export class Product extends BaseEntity {
  @ApiProperty({
    example: 'Product Name',
    description: 'The name of the product',
  })
  @IsString()
  @Column('text')
  name: string;

  @ApiProperty({
    example: 'This is a great product',
    description: 'The description of the product',
  })
  @IsString()
  @Column('text', { nullable: true })
  description?: string;

  // Relationships
  @OneToMany(
    () => WorkspaceProduct,
    (workspaceProduct) => workspaceProduct.product,
  )
  workspaceProducts: WorkspaceProduct[];
}
