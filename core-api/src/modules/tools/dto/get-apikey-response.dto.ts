import { ApiProperty } from '@nestjs/swagger';

export class GetApiKeyResponseDto {
  @ApiProperty()
  apiKey: string;
}
