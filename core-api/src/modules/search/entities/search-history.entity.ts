import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from 'src/common/entities/base.entity';
import { User } from 'src/modules/auth/entities/user.entity';

@Entity('search_history')
export class SearchHistory extends BaseEntity {
  @Column()
  query: string;

  @Column({ type: 'jsonb', nullable: true })
  filters?: Record<string, any>;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
