import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { User } from './user.entity';

@Entity('accounts')
export class Account extends BaseEntity {
  @Column('text')
  accountId: string;

  @Column('text')
  providerId: string;

  @ManyToOne(() => User, (user) => user.accounts, { onDelete: 'CASCADE' })
  user: User;

  @Column('text', { nullable: true })
  accessToken?: string;

  @Column('text', { nullable: true })
  refreshToken?: string;

  @Column('text', { nullable: true })
  idToken?: string;

  @Column('timestamp', { nullable: true })
  accessTokenExpiresAt?: Date;

  @Column('timestamp', { nullable: true })
  refreshTokenExpiresAt?: Date;

  @Column('text', { nullable: true })
  scope?: string;

  @Column('text', { nullable: true })
  password?: string;
}
