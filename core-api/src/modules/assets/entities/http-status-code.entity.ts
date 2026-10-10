import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
} from 'typeorm';
import { AssetService } from './asset-services.entity';
import { HttpResponse } from './http-response.entity';

@Entity('http_status_codes')
@Index('UQ_http_status_codes_primary', ['httpResponseId'], {
  unique: true,
  where: '"isPrimary"',
})
@Index('UQ_http_status_codes_chain', ['httpResponseId', 'chainIndex'], {
  unique: true,
  where: 'NOT "isPrimary"',
})
@Index('IDX_http_status_codes_assetServiceId', ['assetServiceId', 'statusCode'])
@Index('IDX_http_status_codes_httpResponseId', ['httpResponseId'])
export class HttpStatusCode extends BaseEntity {
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
  @Column({ type: 'int' })
  statusCode: number;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @ApiProperty({ required: false })
  @Column({ type: 'int', nullable: true })
  chainIndex?: number;
}
