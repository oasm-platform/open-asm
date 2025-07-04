import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class WorkerJoinDto {
  @ApiProperty()
  @IsString()
  token: string;
}

export class WorkerAliveDto {
  @ApiProperty()
  @IsString()
  token: string;
}
