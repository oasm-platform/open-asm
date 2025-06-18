import { Test, TestingModule } from '@nestjs/testing';
import { TargetsService } from './targets.service';

describe('TargetsService', () => {
  let service: TargetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TargetsService],
    }).compile();

    service = module.get<TargetsService>(TargetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
