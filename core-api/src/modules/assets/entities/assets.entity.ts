import { BaseEntity } from 'src/common/entities/base.entity';
import { Target } from 'src/targets/entities/target.entity';
import { Column, Entity, ManyToOne } from 'typeorm';

@Entity('assets')
export class Assets extends BaseEntity {
  @Column()
  value: string;

  @ManyToOne(() => Target, (target) => target.workspaceTargets, {
    onDelete: 'CASCADE',
  })
  target: Target;
}
