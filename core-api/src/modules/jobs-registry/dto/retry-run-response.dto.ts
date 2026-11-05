import { ApiProperty } from '@nestjs/swagger';

export class RetryRunResponseDto {
  @ApiProperty()
  jobHistoryId: string;

  @ApiProperty()
  message: string;
}
