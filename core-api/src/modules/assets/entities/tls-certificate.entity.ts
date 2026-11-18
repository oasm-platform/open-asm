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

@Entity('tls_certificates')
@Unique(['httpResponseId'])
@Index('IDX_tls_certificates_assetServiceId', ['assetServiceId'])
@Index('IDX_tls_certificates_host', ['host'])
// Tenant scope (attack-surface-query): workspaceId equals the response's.
@ForeignKey(() => HttpResponse, ['httpResponseId', 'workspaceId'], ['id', 'workspaceId'], {
  name: 'FK_tls_certificates_response_workspace',
  onDelete: 'CASCADE',
})
@Index('IDX_tls_certificates_workspace_notAfter', ['workspaceId', 'notAfter', 'id'])
@Index('IDX_tls_certificates_workspace_createdAt', ['workspaceId', 'createdAt', 'id'])
export class TlsCertificate extends BaseEntity {
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

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  jobHistoryId?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  host?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  port?: string;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  probeStatus: boolean;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  tlsVersion?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  cipher?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'timestamptz', nullable: true })
  notBefore?: Date;

  @ApiProperty({ required: false })
  @Column({ type: 'timestamptz', nullable: true })
  notAfter?: Date;

  @ApiProperty({ required: false })
  @Column({ type: 'text', nullable: true })
  subjectDn?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  subjectCn?: string;

  @ApiProperty({ required: false, type: [String] })
  @Column({ type: 'jsonb', nullable: true })
  subjectAn?: string[];

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  serial?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'text', nullable: true })
  issuerDn?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  issuerCn?: string;

  @ApiProperty({ required: false, type: [String] })
  @Column({ type: 'jsonb', nullable: true })
  issuerOrg?: string[];

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  fingerprintMd5?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  fingerprintSha1?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  fingerprintSha256?: string;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  wildcardCertificate: boolean;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  tlsConnection?: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  sni?: string;
}
