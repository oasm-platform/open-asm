import { ApiProperty } from '@nestjs/swagger';

export class CreateTelegramPairingDto {
  @ApiProperty({
    description: 'Connect token shown as QR / link for the user',
  })
  connectToken: string;
}
