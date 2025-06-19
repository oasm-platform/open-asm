import { ApiProperty, PickType } from '@nestjs/swagger';
import { Target } from '../entities/target.entity';
import { IsUUID } from 'class-validator';

export class CreateTargetDto extends PickType(Target, ['value'] as const) {
  @ApiProperty({
    example: 'xxxxxxxx',
    description: 'The id of the workspace',
  })
  @IsUUID('4')
  workspaceId: string;
}
