import { Doc } from '@/common/doc/doc.decorator';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  GetVulnerabilitiesSeverityQueryDto,
  GetVulnerabilitiesSeverityResponseDto,
} from './dto/get-vulnerability-severity.dto';
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
  ) { }

  @Post('scan')
  scan(@Body() scanDto: ScanDto) {
    return this.vulnerabilitiesService.scan(scanDto.targetId);
  }

  @Doc({
    summary: 'Get vulnerabilities',
    description: 'Retrieves a comprehensive list of security vulnerabilities identified across targets and assets, including detailed information about risks and remediation recommendations.',
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
    description: 'Provides aggregated statistical analysis of security vulnerabilities categorized by severity levels, enabling risk assessment and prioritization of remediation efforts.',
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
    summary: 'Get vulnerabilities severity counts',
    description:
      'Provides a detailed breakdown of vulnerability counts by severity level across the workspace hierarchy, following the relationship path from workspace to targets, assets, and vulnerabilities.',
    response: {
      serialization: GetVulnerabilitiesSeverityResponseDto,
    },
  })
  @Get('severity')
  getVulnerabilitiesSeverity(
    @Query() query: GetVulnerabilitiesSeverityQueryDto,
  ) {
    return this.vulnerabilitiesService.getVulnerabilitiesSeverity(query);
  }
}
