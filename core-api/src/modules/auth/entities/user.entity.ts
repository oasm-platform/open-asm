import { BaseEntity } from 'src/common/entities/base.entity';
import { Role } from 'src/common/enums/enum';
import { Column, Entity, OneToMany } from 'typeorm';
import { Account } from './account.entity';
import { Session } from './session.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column('text')
  name: string;

  @Column('text', { unique: true })
  email: string;

  @Column('boolean')
  emailVerified: boolean;

  @Column('text', { nullable: true })
  image?: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];

  @OneToMany(() => Account, (account) => account.user)
  accounts: Account[];
}
