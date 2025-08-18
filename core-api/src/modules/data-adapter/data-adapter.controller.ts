import { Controller } from '@nestjs/common';
import { DataAdapterService } from './data-adapter.service';

@Controller('data-adapter')
export class DataAdapterController {
  constructor(private readonly dataAdapterService: DataAdapterService) {}
}
