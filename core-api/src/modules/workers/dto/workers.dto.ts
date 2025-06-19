import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkerNameId } from 'src/common/enums/enum';

export class WorkerAliveDto {
  @ApiProperty({
    enum: WorkerNameId,
    description: 'Unique identifier for the worker',
  })
  @IsEnum(WorkerNameId)
  workerNameId: WorkerNameId;
}
