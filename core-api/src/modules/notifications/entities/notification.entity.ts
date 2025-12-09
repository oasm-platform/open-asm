import { BaseEntity } from '@/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { NotificationType } from '@/common/enums/enum';

@Entity('notifications')
export class Notification extends BaseEntity {
  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column('jsonb')
  content: {
    key: string;
    metadata?: Record<string, any>;
  };
}
