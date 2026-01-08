import { ApiProperty } from '@nestjs/swagger';

export class CategoryInfoDTO {
  @ApiProperty()
  groups: number[];

  @ApiProperty()
  name: string;

  @ApiProperty()
  priority: number;
}

export class TechnologyDetailDTO {
  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  cats?: number[];

  @ApiProperty({ required: false })
  version?: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  html?: string[];

  @ApiProperty({ required: false })
  icon?: string;

  @ApiProperty({ required: false })
  implies?: string[];

  @ApiProperty({ required: false })
  js?: Record<string, unknown>;

  @ApiProperty({ required: false })
  oss?: boolean;

  @ApiProperty({ required: false })
  scriptSrc?: string[];

  @ApiProperty({ required: false })
  website?: string;

  @ApiProperty({ required: false })
  pricing?: string[];

  @ApiProperty({ required: false })
  saas?: boolean;

  @ApiProperty({ required: false })
  dom?: unknown[];

  @ApiProperty({ required: false })
  meta?: Record<string, unknown>;

  @ApiProperty({ required: false })
  headers?: Record<string, unknown>;

  @ApiProperty({ required: false })
  cookies?: Record<string, unknown>;

  @ApiProperty({ required: false })
  dns?: Record<string, unknown>;

  @ApiProperty({ required: false })
  url?: string[];

  @ApiProperty({ required: false })
  scripts?: string[];

  @ApiProperty({ required: false })
  xhr?: string[];

  @ApiProperty({ required: false })
  requires?: string[];

  @ApiProperty({ required: false })
  categories?: CategoryInfoDTO[];

  @ApiProperty({ required: false })
  iconUrl?: string;

  @ApiProperty({ required: false })
  categoryNames?: string[];
}
