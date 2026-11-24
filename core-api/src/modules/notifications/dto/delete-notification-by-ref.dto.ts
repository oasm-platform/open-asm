import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class DeleteNotificationByRefDto {
  @ApiProperty({
    description: 'Name of the feature the notifications belong to',
    example: 'target',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  ref: string;

  @ApiProperty({
    description: 'Identifier of the related feature record',
    example: '1234',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  refId: string;
}
