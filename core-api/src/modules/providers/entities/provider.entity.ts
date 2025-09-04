import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { User } from 'src/modules/auth/entities/user.entity';
import { Tool } from 'src/modules/tools/entities/tools.entity';
import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
} from 'typeorm';

export enum AuthType {
  NONE = 'none',
  API_KEY = 'apiKey',
  OAUTH2 = 'oauth2',
  JWT = 'jwt',
}

@Entity('tool_providers')
export class ToolProvider extends BaseEntity {
  @ApiProperty({ description: 'Provider name' })
  @IsString()
  @Column()
  name: string;

  @ApiProperty({ description: 'Unique code/slug for provider' })
  @IsString()
  @Column({ unique: true })
  code: string;

  @ApiProperty({ description: 'Provider description' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({ description: 'Logo URL' })
  @IsOptional()
  @IsUrl()
  @Column({ nullable: true })
  logoUrl?: string;

  @ApiProperty({ description: 'Official website URL' })
  @IsOptional()
  @IsUrl()
  @Column({ nullable: true })
  websiteUrl?: string;

  @ApiProperty({ description: 'Support email' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  supportEmail?: string;

  @ApiProperty({ description: 'Company name' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  company?: string;

  @ApiProperty({ description: 'License info' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  licenseInfo?: string;

  @ApiProperty({ description: 'API documentation URL' })
  @IsOptional()
  @IsUrl()
  @Column({ nullable: true })
  apiDocsUrl?: string;

  @ApiProperty({ description: 'Is provider active' })
  @IsBoolean()
  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User, (user) => user.toolProviders)
  owner: User;

  @OneToMany(() => Tool, (tool) => tool.provider)
  tools: Tool[];

  @DeleteDateColumn()
  deletedAt?: Date;
}
