import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { WorkerName } from 'src/common/enums/enum';

export class WorkerJoinDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ enum: WorkerName })
  @IsEnum(WorkerName)
  workerName: WorkerName;
}

export class WorkerAliveDto {
  @ApiProperty()
  @IsString()
  token: string;
}
