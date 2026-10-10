import { CACHE_STATIC_RESOURCE } from '@/common/constants/app.constants';
import { Public } from '@/common/decorators/app.decorator';
import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { StorageService } from '../storage/storage.service';

@ApiTags('Connectors')
@Controller('connectors')
export class ConnectorLogoController {
  constructor(private readonly storageService: StorageService) {}

  @Public()
  @Get(':file')
  @ApiOperation({ summary: 'Get connector logo by file name' })
  @ApiParam({ name: 'file', type: String, required: true })
  async getConnectorLogo(
    @Param('file') file: string,
    @Res({ passthrough: true })
    res: { set: (headers: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    // file is like nuclei.png — stored as connectors/nuclei.png in system bucket
    const key = `connectors/${file}`;
    const { file: stream } = await this.storageService.getFile(key, 'system');
    const cacheControl = `public, max-age=${CACHE_STATIC_RESOURCE}, no-transform`;
    const extension = file.split('.').pop()?.toLowerCase();
    if (extension === 'png') {
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': cacheControl });
    } else if (extension === 'jpg' || extension === 'jpeg') {
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': cacheControl });
    } else if (extension === 'svg') {
      res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': cacheControl });
    } else if (extension === 'webp') {
      res.set({ 'Content-Type': 'image/webp', 'Cache-Control': cacheControl });
    }
    return stream;
  }
}
