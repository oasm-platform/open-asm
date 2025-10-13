import { ApiProperty } from '@nestjs/swagger';
import { Statistic } from '../entities/statistic.entity';


export class TimelineResponseDto {
  @ApiProperty({
    description: 'List of statistics over time',
    type: [Statistic],
  })
  data: Statistic[];

  @ApiProperty({
    description: 'Total count of timeline records',
    example: 5,
  })
  total: number;
}