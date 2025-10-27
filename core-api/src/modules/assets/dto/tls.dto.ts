import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';

export class GetTlsResponseDto {
    @ApiProperty()
    host: string;
    @ApiProperty()
    sni: string;
    @ApiProperty()
    subject_dn: string;
    @ApiProperty()
    subject_an: string[];
    @ApiProperty()
    not_after: string;
    @ApiProperty()
    not_before: string;
    @ApiProperty()
    tls_connection: string;
}

export class GetTlsQueryDto extends GetManyBaseQueryParams {

}
