import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { Tool } from './tools.entity';

@Entity('tool_providers')
export class ToolProvider extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  url?: string;

  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: false })
  isVerified?: boolean;

  @OneToMany(() => Tool, (tool) => tool.provider)
  tools?: Tool[];
}
