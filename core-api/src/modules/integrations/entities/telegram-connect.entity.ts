import { BaseEntity } from '@/common/entities/base.entity';
import { TelegramConnectStatus } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { Integration } from './integration.entity';

@Entity('telegram_connects')
@Index('IDX_telegram_connects_integration', ['integration'])
@Index('IDX_telegram_connects_user', ['user'])
@Index('IDX_telegram_connects_status', ['status'])
export class TelegramConnect extends BaseEntity {
  @Column('text', { nullable: true })
  telegramChatId?: string;

  @Column('text', { nullable: true })
  telegramUsername?: string;

  @Column('text', { nullable: true })
  telegramFirstName?: string;

  @Column('text', { nullable: true })
  telegramLastName?: string;

  @Column('text', { unique: true })
  connectToken: string;

  @Column('timestamp', { nullable: true })
  tokenExpiredAt?: Date;

  @Column('varchar', { default: TelegramConnectStatus.PENDING })
  status: TelegramConnectStatus;

  @Column('boolean', { default: true })
  isActive: boolean;

  @ManyToOne(() => Integration, (integration) => integration.telegramConnects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'integrationId' })
  integration: Relation<Integration>;

  @Column('uuid')
  integrationId: string;

  @ManyToOne(() => User, (user) => user.telegramConnects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column('uuid')
  userId: string;
}
