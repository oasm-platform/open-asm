import { ApiProperty } from '@nestjs/swagger';

export class DeleteResponseDto {
  @ApiProperty({
    description: 'Trạng thái xóa thành công',
    example: true,
  })
  success: boolean;
}
