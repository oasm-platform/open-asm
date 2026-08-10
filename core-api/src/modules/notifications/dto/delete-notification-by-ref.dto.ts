import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteNotificationByRefDto {
  @ApiProperty({
    description: 'Name of the feature the notifications belong to',
    example: 'target',
  })
  @IsString()
  @IsNotEmpty()
  ref: string;

  @ApiProperty({
    description: 'Identifier of the related feature record',
    example: '1234',
  })
  @IsString()
  @IsNotEmpty()
  refId: string;
}
