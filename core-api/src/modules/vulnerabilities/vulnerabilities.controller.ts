import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  GetVulnerabilitiesStatisticsQueryDto,
  GetVulnerabilitiesStatisticsResponseDto,
} from './dto/get-vulnerability-statistics.dto';
import { GetVulnerabilitiesQueryDto } from './dto/get-vulnerability.dto';
import { ScanDto } from './dto/scan.dto';
import { Vulnerability } from './entities/vulnerability.entity';
import { VulnerabilitiesService } from './vulnerabilities.service';

@Controller('vulnerabilities')
export class VulnerabilitiesController {
  constructor(
    private readonly vulnerabilitiesService: VulnerabilitiesService,
  ) {}

  @Doc({
    summary: 'Scan target',
    description:
      'Initiates a vulnerability scan for a specified target, identifying potential security risks and vulnerabilities.',
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('scan')
  scan(@Body() scanDto: ScanDto, @WorkspaceId() workspaceId: string) {
    return this.vulnerabilitiesService.scan(scanDto.targetId, workspaceId);
  }

  @Doc({
    summary: 'Get vulnerabilities',
    description:
      'Retrieves a comprehensive list of security vulnerabilities identified across targets and assets, including detailed information about risks and remediation recommendations.',
    response: {
      serialization: GetManyResponseDto(Vulnerability),
    },
  })
  @Get()
  async getVulnerabilities(@Query() query: GetVulnerabilitiesQueryDto) {
    return this.vulnerabilitiesService.getVulnerabilities(query);
  }

  @Doc({
    summary: 'Get vulnerabilities statistics',
    description:
      'Provides aggregated statistical analysis of security vulnerabilities categorized by severity levels, enabling risk assessment and prioritization of remediation efforts.',
    response: {
      serialization: GetVulnerabilitiesStatisticsResponseDto,
    },
  })
  @Get('statistics')
  async getVulnerabilitiesStatistics(
    @Query() query: GetVulnerabilitiesStatisticsQueryDto,
  ) {
    return this.vulnerabilitiesService.getVulnerabilitiesStatistics(query);
  }

  @Doc({
    summary: 'Get vulnerability by id',
    description:
      'Retrieves detailed information about a specific security vulnerability identified within the system, including its attributes, associated assets, and remediation guidance.',
    response: {
      serialization: Vulnerability,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':id')
  getVulnerabilityById(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.vulnerabilitiesService.getVulnerability(id, workspaceId);
  }
}
