import { SwaggerPropertyMetadata } from '@/common/utils/get-swagger-metadata.util';
import { ApiProperty } from '@nestjs/swagger';

export class GetWorkspaceConfigsDto {
  @ApiProperty({ type: SwaggerPropertyMetadata })
  isAssetsDiscovery?: SwaggerPropertyMetadata;
  @ApiProperty({ type: SwaggerPropertyMetadata })
  isAutoEnableAssetAfterDiscovered?: SwaggerPropertyMetadata;
}
