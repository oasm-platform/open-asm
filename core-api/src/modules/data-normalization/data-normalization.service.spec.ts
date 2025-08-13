import { Test, TestingModule } from '@nestjs/testing';
import { DataNormalizationService } from './data-normalization.service';

describe('DataNormalizationService', () => {
  let service: DataNormalizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataNormalizationService],
    }).compile();

    service = module.get<DataNormalizationService>(DataNormalizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
