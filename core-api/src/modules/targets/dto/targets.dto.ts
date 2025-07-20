import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { ScanStatus } from 'src/common/enums/enum';
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
  @ApiProperty({ enum: ScanStatus, example: ScanStatus.DONE })
  status: ScanStatus;

  @ApiProperty({ example: 100 })
  totalAssets: number;
}

export class GetManyWorkspaceQueryParamsDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: true })
  @IsUUID('4')
  workspaceId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  value?: string;
}
