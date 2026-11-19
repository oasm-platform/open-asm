import { BaseEntity } from '@/common/entities/base.entity';
import { Role } from '@/common/enums/enum';
import { WorkspaceMembers } from '@/modules/workspaces/entities/workspace-members.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany, Relation } from 'typeorm';
import { Account } from './account.entity';
import { Session } from './session.entity';

@Entity('users')
export class User extends BaseEntity {
  @ApiProperty()
  @Column('text')
  name: string;

  @Column('text', { unique: true })
  email: string;

  @Column('boolean')
  emailVerified: boolean;

  @Column('text', { nullable: true })
  image?: string;

  @ApiProperty({ enum: Role })
  @Column({ type: 'varchar', default: Role.USER })
  role: Role;

  @Column({ type: 'text', default: 'en' })
  language: string;

  @OneToMany(() => Session, (session) => session.user)
  sessions: Relation<Session[]>;

  @OneToMany(() => Account, (account) => account.user)
  accounts: Relation<Account[]>;

  @OneToMany(
    () => WorkspaceMembers,
    (workspaceMembers) => workspaceMembers.user,
  )
  workspaceMembers: Relation<WorkspaceMembers[]>;

  @Column('date', { nullable: true })
  banExpires: Date;

  @Column('boolean', { nullable: true })
  banned?: boolean;

  @Column('text', { nullable: true })
  banReason?: string;
}
