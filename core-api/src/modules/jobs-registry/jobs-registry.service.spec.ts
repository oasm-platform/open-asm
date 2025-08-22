import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { JobsRegistryService } from './jobs-registry.service';

describe('JobsRegistryService', () => {
  let service: JobsRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JobsRegistryService],
    }).compile();

    service = module.get<JobsRegistryService>(JobsRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
