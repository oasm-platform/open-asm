import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { CronSchedule, ScanStatus } from '@/common/enums/enum';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Target } from '../entities/target.entity';

export class CreateTargetDto extends PickType(Target, ['value'] as const) {
  @ApiProperty({
    example: 'xxxxxxxx',
    description: 'The id of the workspace',
  })
  @IsUUID('4')
  workspaceId: string;
}

export class GetManyTargetResponseDto {
  @ApiProperty()
  @IsUUID('4')
  id: string;

  @ApiProperty()
  value: string;

  @ApiProperty()
  reScanCount: number;

  @ApiProperty({ enum: CronSchedule })
  scanSchedule: CronSchedule;

  @ApiProperty({ enum: ScanStatus, example: ScanStatus.DONE })
  status?: ScanStatus;

  @ApiProperty({ example: 100 })
  totalAssets: number;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  lastDiscoveredAt: Date;
}

export class GetManyWorkspaceQueryParamsDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  value?: string;
}

export class UpdateTargetDto {
  @ApiProperty({ enum: CronSchedule })
  @IsString()
  @IsEnum(CronSchedule)
  @IsOptional()
  scanSchedule?: CronSchedule;
}
