import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('api-keys')
@Controller('api-keys')
export class ApiKeysController {}
