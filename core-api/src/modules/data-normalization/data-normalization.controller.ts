import { Controller } from '@nestjs/common';
import { DataNormalizationService } from './data-normalization.service';

@Controller('data-normalization')
export class DataNormalizationController {
  constructor(private readonly dataNormalizationService: DataNormalizationService) {}
}
