import { Roles } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import { Body, Controller, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpdateSystemConfigDto } from './dto/system-configs.dto';
import { SystemConfigsService } from './system-configs.service';

/**
 * Controller for system configuration management
 * All endpoints require ADMIN role
 */
@ApiTags('System Configs')
@Controller('system-configs')
@Roles(Role.ADMIN)
export class SystemConfigsController {
  constructor(private readonly systemConfigsService: SystemConfigsService) {}

  /**
   * Update system configuration
   * @param dto Update data
   * @returns Success message
   */
  @Put()
  @Doc<DefaultMessageResponseDto>({
    summary: 'Update system configuration',
    description: 'Updates the system configuration settings',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  async updateConfig(
    @Body() dto: UpdateSystemConfigDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.systemConfigsService.updateConfig(dto);
  }
}
