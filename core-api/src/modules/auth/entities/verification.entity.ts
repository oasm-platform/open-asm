import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('verifications')
export class Verification extends BaseEntity {
  @Column('text')
  identifier: string;

  @Column('text')
  value: string;

  @Column('timestamp')
  expiresAt: Date;
}
