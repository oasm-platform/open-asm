import { BaseEntity } from 'src/common/entities/base.entity';
import { Asset } from './assets.entity';
import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { JobHistory } from 'src/modules/jobs-registry/entities/job-history.entity';

// Interface cho TLS information
interface TlsInfo {
  host: string;
  port: string;
  probe_status: boolean;
  tls_version: string;
  cipher: string;
  not_before: string;
  not_after: string;
  subject_dn: string;
  subject_cn: string;
  subject_an: string[];
  serial: string;
  issuer_dn: string;
  issuer_cn: string;
  issuer_org: string[];
  fingerprint_hash: {
    md5: string;
    sha1: string;
    sha256: string;
  };
  wildcard_certificate: boolean;
  tls_connection: string;
  sni: string;
}

// Interface cho Header information
interface HeaderInfo {
  [key: string]: string;
}

// Interface cho Knowledgebase information
interface KnowledgebaseInfo {
  PageType: string;
  pHash: number;
}

@Entity('httpxs')
export class Httpx extends BaseEntity {
  @Column({ type: 'timestamp with time zone', nullable: true })
  timestamp?: Date;

  @Column({ type: 'jsonb', nullable: true })
  tls: TlsInfo;

  @Column({ type: 'varchar', nullable: true })
  port?: string;

  @Column({ type: 'varchar', nullable: true })
  url?: string;

  @Column({ type: 'varchar', nullable: true })
  input: string;

  @Column({ type: 'text', nullable: true })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  scheme: string;

  @Column({ type: 'varchar', nullable: true })
  webserver: string;

  @Column({ type: 'text', nullable: true })
  body: string;

  @Column({ type: 'varchar', nullable: true })
  content_type: string;

  @Column({ type: 'varchar', nullable: true })
  method: string;

  @Column({ type: 'varchar', nullable: true })
  host: string;

  @Column({ type: 'varchar', nullable: true })
  path: string;

  @Column({ type: 'varchar', nullable: true })
  favicon: string;

  @Column({ type: 'varchar', nullable: true })
  favicon_md5: string;

  @Column({ type: 'varchar', nullable: true })
  favicon_url: string;

  @Column({ type: 'jsonb', nullable: true })
  header: HeaderInfo;

  @Column({ type: 'text', nullable: true })
  raw_header: string;

  @Column({ type: 'text', nullable: true })
  request: string;

  @Column({ type: 'varchar', nullable: true })
  time: string;

  @Column({ array: true, type: 'varchar', nullable: true })
  a: string[];

  @Column({ array: true, type: 'varchar', nullable: true })
  tech: string[];

  @Column({ type: 'integer', nullable: true })
  words: number;

  @Column({ type: 'integer', nullable: true })
  lines: number;

  @Column({ type: 'integer', nullable: true })
  status_code: number;

  @Column({ type: 'integer', nullable: true })
  content_length: number;

  @Column({ type: 'boolean', default: false })
  failed: boolean;

  @Column({ type: 'jsonb', nullable: true })
  knowledgebase: KnowledgebaseInfo;

  @Column({ array: true, type: 'varchar', nullable: true })
  resolvers: string[];

  @Column({ type: 'varchar', nullable: true })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.httpxs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @Column({ type: 'varchar', nullable: true })
  jobHistoryId: string;

  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.httpxs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory: JobHistory;
}
