import { Public } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetMetadataDto, GetVersionDto } from './dto/root.dto';
import { RootService } from './root.service';

@ApiTags('Root')
@Controller()
export class RootController {
  constructor(private readonly rootService: RootService) {}

  @Public()
  @Get('health')
  getHealth(): string {
    return this.rootService.getHealth();
  }

  @Public()
  @Doc({
    summary: 'Get system metadata.',
    description:
      'Returns metadata about the system state, like whether it has been initialized.',
    response: {
      serialization: GetMetadataDto,
    },
  })
  @Get('metadata')
  getMetadata() {
    return this.rootService.getMetadata();
  }

  @Public()
  @Doc({
    summary: 'Get the latest version.',
    description: 'Returns the latest version information stored in Redis.',
    response: {
      serialization: GetVersionDto,
    },
  })
  @Get('version/latest')
  getLatestVersion(): Promise<GetVersionDto> {
    return this.rootService.getLatestVersion();
  }
}
