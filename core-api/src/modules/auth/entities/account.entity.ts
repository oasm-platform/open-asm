import { BaseEntity } from '@/common/entities/base.entity';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { User } from './user.entity';

@Entity('accounts')
@Index('IDX_accounts_userId', ['user'])
@Index('IDX_accounts_provider_account', ['providerId', 'accountId'])
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
