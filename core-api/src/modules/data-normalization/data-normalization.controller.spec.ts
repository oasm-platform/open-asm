import { Test, TestingModule } from '@nestjs/testing';
import { DataNormalizationController } from './data-normalization.controller';
import { DataNormalizationService } from './data-normalization.service';

describe('DataNormalizationController', () => {
  let controller: DataNormalizationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataNormalizationController],
      providers: [DataNormalizationService],
    }).compile();

    controller = module.get<DataNormalizationController>(DataNormalizationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
