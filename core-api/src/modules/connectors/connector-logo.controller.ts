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
    const stream = await this.storageService.getFile(key, 'system');
    const extension = file.split('.').pop()?.toLowerCase();
    if (extension === 'png') {
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'max-age=1209600, no-transform' });
    } else if (extension === 'jpg' || extension === 'jpeg') {
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=1209600, no-transform' });
    } else if (extension === 'svg') {
      res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=1209600, no-transform' });
    } else if (extension === 'webp') {
      res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=1209600, no-transform' });
    }
    return stream;
  }
}
