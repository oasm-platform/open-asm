import { Doc } from '@/common/doc/doc.decorator';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetStatisticQueryDto, StatisticResponseDto } from './dto/statistic.dto';
import { StatisticService } from './statistic.service';

@ApiTags('Statistic')
@Controller('statistic')
export class StatisticController {
  constructor(private readonly statisticService: StatisticService) { }

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