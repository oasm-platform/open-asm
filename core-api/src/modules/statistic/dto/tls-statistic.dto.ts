import { ApiProperty } from '@nestjs/swagger';

export class TlsStatisticResponseDto {
  @ApiProperty()
  alreadyExpired: number;

  @ApiProperty()
  expireInAMonth: number;

  @ApiProperty()
  expireIn3Months: number;

  @ApiProperty()
  wontExpireAnytimeSoon: number;

  @ApiProperty()
  newCertificatesDiscovered: number;
}
