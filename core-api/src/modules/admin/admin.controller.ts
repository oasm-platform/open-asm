import { Public, Roles } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import { CreateToolDto } from '@/modules/tools/dto/create-tool.dto';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { ToolsService } from '@/modules/tools/tools.service';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateFirstAdminDto } from './dto/admin.dto';

/**
 * System administration endpoints.
 * Every route requires the ADMIN role unless marked @Public().
 */
@ApiTags('Admin')
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly toolsService: ToolsService,
  ) {}

  @Public()
  @Doc({
    summary: 'Creates the first admin user in the system.',
    description:
      'Creates the first admin user in the system. Refused once an admin exists.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post('init')
  createFirstAdmin(
    @Body() dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.adminService.createFirstAdmin(dto);
  }

  @Doc({
    summary: 'Create a new tool',
    description:
      'Registers a new security assessment tool in the system with specified configuration and capabilities.',
    response: {
      serialization: Tool,
    },
  })
  @Post('tools')
  createTool(@Body() dto: CreateToolDto) {
    return this.toolsService.createTool(dto);
  }
}
