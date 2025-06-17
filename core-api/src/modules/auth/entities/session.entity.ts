import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { User } from './user.entity';

@Entity('sessions')
export class Session extends BaseEntity {
  @Column('timestamp')
  expiresAt: Date;

  @Column('text', { unique: true })
  token: string;

  @Column('text', { nullable: true })
  ipAddress?: string;

  @Column('text', { nullable: true })
  userAgent?: string;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  impersonatedBy: User;
}
