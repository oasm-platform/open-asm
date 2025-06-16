import { Test, TestingModule } from '@nestjs/testing';
import { RootService } from './root.service';

describe('RootService', () => {
  let service: RootService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RootService],
    }).compile();

    service = module.get<RootService>(RootService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
