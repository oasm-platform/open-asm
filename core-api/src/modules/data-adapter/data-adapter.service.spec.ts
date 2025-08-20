import { Test, TestingModule } from '@nestjs/testing';
import { DataAdapterService } from './data-adapter.service';

describe('DataAdapterService', () => {
  let service: DataAdapterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataAdapterService],
    }).compile();

    service = module.get<DataAdapterService>(DataAdapterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
