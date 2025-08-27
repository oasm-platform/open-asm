import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
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
  ) {}

  @Post('scan')
  scan(@Body() scanDto: ScanDto) {
    return this.vulnerabilitiesService.scan(scanDto.targetId);
  }

  @Doc({
    summary: 'Get vulnerabilities',
    description: 'Get vulnerabilities',
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
    description: 'Get count of vulnerabilities by severity level',
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
      'Get count of vulnerabilities by severity level based on workspaceId -> target -> assets -> vuls relation path',
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
