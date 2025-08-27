import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from 'src/common/entities/base.entity';
import { JobHistory } from 'src/modules/jobs-registry/entities/job-history.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Asset } from './assets.entity';

class TlsInfo {
  @ApiProperty()
  host: string;
  @ApiProperty()
  port: string;
  @ApiProperty()
  probe_status: boolean;
  @ApiProperty()
  tls_version: string;
  @ApiProperty()
  cipher: string;
  @ApiProperty()
  not_before: string;
  @ApiProperty()
  not_after: string;
  @ApiProperty()
  subject_dn: string;
  @ApiProperty()
  subject_cn: string;
  @ApiProperty()
  subject_an: string[];
  @ApiProperty()
  serial: string;
  @ApiProperty()
  issuer_dn: string;
  @ApiProperty()
  issuer_cn: string;
  @ApiProperty()
  issuer_org: string[];
  @ApiProperty()
  fingerprint_hash: {
    md5: string;
    sha1: string;
    sha256: string;
  };
  @ApiProperty()
  wildcard_certificate: boolean;
  @ApiProperty()
  tls_connection: string;
  @ApiProperty()
  sni: string;
}

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
export class HttpResponse extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'timestamp with time zone', nullable: true })
  timestamp?: Date;

  @ApiProperty()
  @Column({ type: 'jsonb', nullable: true })
  tls: TlsInfo;

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
  @Column({ array: true, type: 'varchar', nullable: true })
  a: string[];

  @ApiProperty()
  @Column({ array: true, type: 'varchar', nullable: true })
  tech: string[];

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

  @ApiProperty()
  @Column({ array: true, type: 'varchar', nullable: true })
  resolvers: string[];

  @ApiProperty()
  @Column({ array: true, type: 'varchar', nullable: true })
  chain_status_codes: string[];

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.httpResponses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  jobHistoryId: string;

  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.httpResponses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory: JobHistory;
}
