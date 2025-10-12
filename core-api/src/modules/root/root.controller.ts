import { Public } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateFirstAdminDto, GetMetadataDto } from './dto/root.dto';
import { RootService } from './root.service';

@ApiTags('Root')
@Controller()
export class RootController {
  constructor(private readonly rootService: RootService) { }

  @Public()
  @Get('health')
  getHealth(): string {
    return this.rootService.getHealth();
  }

  @Public()
  @Doc({
    summary: 'Creates the first admin user in the system.',
    description: 'Creates the first admin user in the system.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post('init-admin')
  createFirstAdmin(
    @Body() dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.rootService.createFirstAdmin(dto);
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
}
