import { BaseEntity } from '@/common/entities/base.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
} from 'typeorm';
import { AssetService } from './asset-services.entity';
import { HttpResponseTechnology } from './http-response-technology.entity';
import { HttpStatusCode } from './http-status-code.entity';
import { IpObservation } from './ip-observation.entity';
import { TlsCertificate } from './tls-certificate.entity';

// Interface cho Header information
interface HeaderInfo {
  [key: string]: string;
}

class KnowledgebaseInfo {
  @ApiProperty()
  PageType: string;
  @ApiProperty()
  pHash: number;
}

@Entity('http_responses')
@Index('IDX_http_jobHistoryId', ['jobHistory'])
@Index('IDX_http_host', ['host'])
// "Latest response per service" lookups (ORDER BY createdAt DESC LIMIT 1);
// its assetServiceId prefix also serves the FK.
@Index('IDX_http_responses_assetServiceId_createdAt', [
  'assetServiceId',
  'createdAt',
])
export class HttpResponse extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'timestamp with time zone', nullable: true })
  timestamp?: Date;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  port?: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  url?: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  input: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  title: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  scheme: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  webserver: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  body: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  content_type: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  method: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  host: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  path: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  favicon: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  favicon_md5: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  favicon_url: string;

  @ApiProperty()
  @Column({ type: 'jsonb', nullable: true })
  header: HeaderInfo;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  raw_header: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  request: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  time: string;

  @ApiProperty()
  @Column({ type: 'integer', nullable: true })
  words: number;

  @ApiProperty()
  @Column({ type: 'integer', nullable: true })
  lines: number;

  @ApiProperty()
  @Column({ type: 'integer', nullable: true })
  status_code: number;

  @ApiProperty()
  @Column({ type: 'integer', nullable: true })
  content_length: number;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  failed: boolean;

  @ApiProperty()
  @Column({ type: 'jsonb', nullable: true })
  knowledgebase: KnowledgebaseInfo;

  /**
   * Ingest-only compat fields — accepted from the httpx worker payload but
   * NOT persisted here. DataAdapterService splits them into child tables
   * (tls_certificates, http_response_technologies, ip_observations,
   * http_status_codes). No @Column decorator on purpose so TypeORM and
   * migration:generate ignore them, while Swagger/OpenAPI shape stays stable.
   */
  @ApiProperty({ required: false })
  tls?: Record<string, unknown> | null;

  @ApiProperty({ required: false, type: [String] })
  tech?: string[];

  @ApiProperty({ required: false, type: [String] })
  a?: string[];

  @ApiProperty({ required: false, type: [String] })
  resolvers?: string[];

  @ApiProperty({ required: false, type: [String] })
  chain_status_codes?: string[];

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  assetServiceId: string;

  @ManyToOne(() => AssetService, (assetService) => assetService.httpResponses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetServiceId' })
  assetService: Relation<AssetService>;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  jobHistoryId: string;

  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.httpResponses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory: Relation<JobHistory>;

  @OneToMany(() => TlsCertificate, (tls) => tls.httpResponse, {
    onDelete: 'CASCADE',
  })
  tlsCertificates?: Relation<TlsCertificate[]>;

  @OneToMany(() => HttpResponseTechnology, (tech) => tech.httpResponse, {
    onDelete: 'CASCADE',
  })
  technologies?: Relation<HttpResponseTechnology[]>;

  @OneToMany(() => IpObservation, (ip) => ip.httpResponse, {
    onDelete: 'CASCADE',
  })
  ipObservations?: Relation<IpObservation[]>;

  @OneToMany(() => HttpStatusCode, (sc) => sc.httpResponse, {
    onDelete: 'CASCADE',
  })
  statusCodes?: Relation<HttpStatusCode[]>;
}
