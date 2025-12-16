import { BaseEntity } from '@/common/entities/base.entity';
import { IssueSourceType, IssueStatus, Severity } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

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
        enum: Severity,
        default: Severity.INFO,
    })
    severity: Severity;

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
}
