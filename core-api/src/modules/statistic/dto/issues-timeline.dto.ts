import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsNumber } from 'class-validator';

export class IssuesTimelineItem {
  @ApiProperty({
    description: 'Number of vulnerabilities',
    example: 10,
  })
  @IsNumber()
  vuls: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2023-10-27T10:00:00Z',
  })
  @IsDate()
  createdAt: Date;
}

export class IssuesTimelineResponseDto {
  @ApiProperty({
    description: 'List of issues over time',
    type: [IssuesTimelineItem],
  })
  data: IssuesTimelineItem[];

  @ApiProperty({
    description: 'Total count of issues timeline records',
    example: 5,
  })
  @IsNumber()
  total: number;
}