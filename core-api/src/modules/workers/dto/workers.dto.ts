import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';

export class WorkerJoinDto {
  @ApiProperty()
  @IsString()
  apiKey: string;
}

export class WorkerAliveDto {
  @ApiProperty()
  @IsString()
  token: string;
}

export class GetManyWorkersDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsUUID(7)
  @IsOptional()
  workspaceId?: string;
}
