import { Doc } from '@/common/doc/doc.decorator';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TechnologyDetailDTO } from './dto/technology-detail.dto';
import { TechnologyForwarderService } from './technology-forwarder.service';

interface TechnologyWithCategory extends TechnologyDetailDTO {
  categoryNames?: string[];
}

@ApiTags('Technology')
@Controller('technology')
export class TechnologyController {
  constructor(
    private readonly technologyForwarderService: TechnologyForwarderService,
  ) { }

  @Doc({
    summary: 'Get technology information',
    description: 'Retrieves detailed information about a specific technology.',
    response: {
      serialization: TechnologyDetailDTO,
    },
  })
  @Get(':name')
  async getTechnologyInfo(
    @Param('name') name: string,
  ): Promise<TechnologyWithCategory | null> {
    const techInfo =
      await this.technologyForwarderService.fetchTechnologyInfo(name);

    // Add icon URL if icon name is available
    if (techInfo && techInfo.icon) {
      return {
        ...techInfo,
        iconUrl: this.technologyForwarderService.getIconUrl(techInfo.icon),
      };
    }

    return techInfo;
  }
}
