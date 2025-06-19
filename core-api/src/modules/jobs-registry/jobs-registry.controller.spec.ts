import { Test, TestingModule } from '@nestjs/testing';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';

describe('JobsRegistryController', () => {
  let controller: JobsRegistryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsRegistryController],
      providers: [JobsRegistryService],
    }).compile();

    controller = module.get<JobsRegistryController>(JobsRegistryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
