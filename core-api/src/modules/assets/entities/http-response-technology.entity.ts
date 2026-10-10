import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { AssetService } from './asset-services.entity';
import { HttpResponse } from './http-response.entity';

@Entity('http_response_technologies')
@Unique(['httpResponseId', 'name', 'version'])
@Index('IDX_http_response_technologies_assetServiceId', ['assetServiceId'])
@Index('IDX_http_response_technologies_name', ['name'])
@Index('IDX_http_response_technologies_httpResponseId', ['httpResponseId'])
export class HttpResponseTechnology extends BaseEntity {
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
