import { SwaggerPropertyMetadata } from '@/utils/getSwaggerMetadata';
import { ApiProperty } from '@nestjs/swagger';

export class GetWorkspaceConfigsDto {
    @ApiProperty({ type: SwaggerPropertyMetadata })
    isAssetsDiscovery?: SwaggerPropertyMetadata;
    @ApiProperty({ type: SwaggerPropertyMetadata })
    isAutoEnableAssetAfterDiscovered?: SwaggerPropertyMetadata;
}