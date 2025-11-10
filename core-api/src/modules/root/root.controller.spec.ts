import { AUTH_INSTANCE_KEY } from '@/common/constants/app.constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { User } from '../auth/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RootController } from './root.controller';
import { RootService } from './root.service';

describe('RootController', () => {
  let controller: RootController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RootController],
      providers: [
        RootService,
        UsersService,
        {
          provide: AuthService,
          useValue: {
            api: {
              signUpEmail: jest.fn(),
              signInEmail: jest.fn(),
            },
          },
        },
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
        {
          provide: AUTH_INSTANCE_KEY,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<RootController>(RootController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
