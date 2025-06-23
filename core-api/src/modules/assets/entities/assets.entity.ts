import { BaseEntity } from 'src/common/entities/base.entity';
import { Job } from 'src/modules/jobs-registry/entities/job.entity';
import { Target } from 'src/modules/targets/entities/target.entity';
import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';

@Entity('assets')
export class Asset extends BaseEntity {
  @Column()
  value: string;

  // Relationships
  @ManyToOne(() => Target, (target) => target.workspaceTargets, {
    onDelete: 'CASCADE',
  })
  target: Target;

  @Column({ default: false })
  isPrimary: boolean;

  @OneToMany(() => Job, (job) => job.asset, {
    onDelete: 'CASCADE',
  })
  jobs: Job[];
}
