import { BaseEntity } from '@/common/entities/base.entity';
import { IssueSourceType, IssueStatus } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('issues')
export class Issue extends BaseEntity {
    @ApiProperty()
    @Column()
    title: string;

    @ApiProperty()
    @Column({ nullable: true })
    description?: string;

    @ApiProperty()
    @Column({
        type: 'enum',
        enum: IssueStatus,
        default: IssueStatus.OPEN,
    })
    status: IssueStatus;



    @ApiProperty()
    @Column({
        type: 'enum',
        enum: IssueSourceType,
        nullable: true,
    })
    sourceType: IssueSourceType;

    @ApiProperty()
    @Column({ nullable: true })
    sourceId: string;

    @ApiProperty()
    @Column({ nullable: true })
    workspaceId: string;

    @ApiProperty()
    @Column({ type: 'int', default: 0 })
    no: number;

    @ManyToOne(() => Workspace)
    @JoinColumn({ name: 'workspaceId' })
    workspace: Workspace;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'createdById' })
    createdBy: User;

    @Column({ nullable: true })
    createdById: string;
}
