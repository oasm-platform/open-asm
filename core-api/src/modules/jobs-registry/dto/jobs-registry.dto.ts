import { ApiProperty } from '@nestjs/swagger';
import { WorkerName } from 'src/common/enums/enum';

export class GetNextJobResponseDto {
  @ApiProperty()
  jobId: string;
  @ApiProperty()
  value: string;
  @ApiProperty()
  workerName: WorkerName;
}
