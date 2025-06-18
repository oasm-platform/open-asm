import { Test, TestingModule } from '@nestjs/testing';
import { TargetsController } from './targets.controller';
import { TargetsService } from './targets.service';

describe('TargetsController', () => {
  let controller: TargetsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TargetsController],
      providers: [TargetsService],
    }).compile();

    controller = module.get<TargetsController>(TargetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
