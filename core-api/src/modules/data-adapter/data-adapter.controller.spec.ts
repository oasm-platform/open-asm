import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataAdapterController } from './data-adapter.controller';
import { DataAdapterService } from './data-adapter.service';

describe('DataAdapterController', () => {
  let controller: DataAdapterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataAdapterController],
      providers: [DataAdapterService],
    }).compile();

    controller = module.get<DataAdapterController>(DataAdapterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
