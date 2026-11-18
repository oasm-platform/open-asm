import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { AssetService } from './asset-services.entity';
import { HttpResponse } from './http-response.entity';

@Entity('http_response_technologies')
// NULLS NOT DISTINCT (set in the migration; TypeORM cannot express it) so a
// version-less tech dedupes. Its httpResponseId prefix serves lookups + FK.
@Unique(['httpResponseId', 'name', 'version'])
@Index('IDX_http_response_technologies_assetServiceId', ['assetServiceId'])
@Index('IDX_http_response_technologies_name', ['name'])
// Tenant scope (attack-surface-query): workspaceId equals the response's.
@ForeignKey(() => HttpResponse, ['httpResponseId', 'workspaceId'], ['id', 'workspaceId'], {
  name: 'FK_http_response_technologies_response_workspace',
  onDelete: 'CASCADE',
})
@Index('IDX_http_response_technologies_workspace_name', ['workspaceId', 'name'])
@Index('IDX_http_response_technologies_workspace_createdAt', ['workspaceId', 'createdAt', 'id'])
export class HttpResponseTechnology extends BaseEntity {
  /** The response's workspace (denormalized, see Asset.workspaceId). */
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ApiProperty()
  @Column({ type: 'uuid' })
  httpResponseId: string;

  @ManyToOne(() => HttpResponse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'httpResponseId' })
  httpResponse: Relation<HttpResponse>;

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', nullable: true })
  assetServiceId?: string;

  @ManyToOne(() => AssetService, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'assetServiceId' })
  assetService?: Relation<AssetService>;

  @ApiProperty()
  @Column({ type: 'varchar' })
  name: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  version?: string;
}
