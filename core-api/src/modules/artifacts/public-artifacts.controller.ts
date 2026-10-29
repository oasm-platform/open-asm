import { Public } from '@/common/decorators/app.decorator';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { Controller, Get, Param, Redirect } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArtifactsService } from './artifacts.service';

/** Anonymous downloads for files whose owner made them public. */
@ApiTags('Artifacts')
@Controller('public/artifacts')
export class PublicArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  @ApiOperation({
    summary: 'Download a public file',
    description:
      'Redirects to a short-lived download URL. 404 when the file does not exist or is not public.',
  })
  @Public()
  @Redirect()
  @Get(':id')
  async download(@Param() { id }: IdQueryParamDto) {
    const { url } = await this.artifactsService.getPublicDownloadUrl(id);
    return { url };
  }
}
