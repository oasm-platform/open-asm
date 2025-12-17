import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { UsersService } from '../users/users.service';
import { RootService } from './root.service';

describe('RootService', () => {
  let service: RootService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RootService,
        {
          provide: UsersService,
          useValue: {
            createFirstAdmin: jest.fn(),
            usersRepository: {
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<RootService>(RootService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
