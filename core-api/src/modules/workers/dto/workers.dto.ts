import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkerName } from 'src/common/enums/enum';

export class WorkerAliveDto {
  @ApiProperty({
    enum: WorkerName,
    description: 'Unique identifier for the worker',
  })
  @IsEnum(WorkerName)
  workerNameId: WorkerName;
}
