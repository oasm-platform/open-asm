import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from 'src/common/doc/doc.decorator';
import { StatisticService } from './statistic.service';
import { GetStatisticQueryDto, StatisticResponseDto } from './dto/statistic.dto';

@ApiTags('Statistic')
@Controller('statistic')
export class StatisticController {
  constructor(private readonly statisticService: StatisticService) {}

  @Doc({
    summary: 'Get workspace statistics',
    description: 'Retrieves statistics for a workspace including total targets, assets, vulnerabilities, and unique technologies.',
    response: {
      serialization: StatisticResponseDto,
    },
  })
  @Get()
  getStatistics(@Query() query: GetStatisticQueryDto) {
    return this.statisticService.getStatistics(query);
  }
}