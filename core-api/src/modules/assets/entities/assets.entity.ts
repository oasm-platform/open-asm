import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Target } from './target.entity';

@Entity('assets')
export class Assets extends BaseEntity {
  @Column()
  value: string;

  @ManyToOne(() => Target, (target) => target.workspaceTargets, {
    onDelete: 'CASCADE',
  })
  target: Target;
}
