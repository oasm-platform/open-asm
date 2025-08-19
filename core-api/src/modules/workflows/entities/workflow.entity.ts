import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity('workflows')
@Index(['filePath'], { unique: true })
export class Workflow extends BaseEntity {
  @Column()
  name: string;

  @Column('text')
  content: string;

  @Column()
  filePath: string;
}
