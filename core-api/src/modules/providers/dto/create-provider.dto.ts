import { PickType } from '@nestjs/swagger';
import { ToolProvider } from '../entities/provider.entity';

export class CreateProviderDto extends PickType(ToolProvider, [
  'name',
  'code',
  'description',
  'logoUrl',
  'websiteUrl',
  'supportEmail',
  'company',
  'licenseInfo',
  'apiDocsUrl',
] as const) {}
