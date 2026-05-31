import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity('search_histories')
@Index('IDX_search_hist_userId', ['user', 'createdAt'])
export class SearchHistory extends BaseEntity {
  @ApiProperty()
  @Column({ nullable: true })
  query: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
