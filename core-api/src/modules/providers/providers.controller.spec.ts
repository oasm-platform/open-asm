import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Role } from 'src/common/enums/enum';
import type { CreateProviderDto } from './dto/create-provider.dto';
import type { ToolProvider } from './entities/provider.entity';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

// Create a mock interface that combines the properties we need for testing
interface MockUserContext {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string;
  createdAt: Date;
  updatedAt: Date;
  role: Role;
}

describe('ProvidersController', () => {
  let controller: ProvidersController;
  let service: ProvidersService;

  const mockUserContext: MockUserContext = {
    id: 'user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    image: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    role: Role.USER,
  };

  const mockCreateProviderDto: CreateProviderDto = {
    name: 'Test Provider',
    code: 'test-provider-code',
  };

  const mockProvider: ToolProvider = {
    id: 'provider-id',
    name: 'Test Provider',
    code: 'test-provider-code',
    ownerId: 'user-id',
    isActive: true,
     
    owner: mockUserContext as any,
    tools: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ToolProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProvidersController],
      providers: [
        {
          provide: ProvidersService,
          useValue: {
            createProvider: jest.fn().mockResolvedValue(mockProvider),
          },
        },
      ],
    }).compile();

    controller = module.get<ProvidersController>(ProvidersController);
    service = module.get<ProvidersService>(ProvidersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createProvider', () => {
    it('should create a provider', async () => {
      const result = await controller.createProvider(
        mockCreateProviderDto,
         
        mockUserContext as any,
      );
      expect(result).toEqual(mockProvider);
      const createProviderSpy = jest.spyOn(service, 'createProvider');
      expect(createProviderSpy).toHaveBeenCalledWith(
        mockCreateProviderDto,
        mockUserContext,
      );
    });
  });
});
