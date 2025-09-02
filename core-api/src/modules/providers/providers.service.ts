import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { Repository } from 'typeorm';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ToolProvider } from './entities/provider.entity';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(ToolProvider)
    private readonly providersRepository: Repository<ToolProvider>,
  ) {}

  /**
   * Create a new provider
   * @param createProviderDto
   * @param userContext
   * @returns
   */
  async createProvider(
    createProviderDto: CreateProviderDto,
    userContext: UserContextPayload,
  ): Promise<ToolProvider> {
    const provider = this.providersRepository.create({
      ...createProviderDto,
      owner: { id: userContext.id },
    });

    return this.providersRepository.save(provider);
  }

  /**
   * Get a provider by ID
   * @param id
   * @returns
   */
  async getProviderById(id: string): Promise<ToolProvider> {
    const provider = await this.providersRepository.findOne({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`Provider with ID ${id} not found`);
    }

    return provider;
  }

  /**
   * Update a provider by ID
   * @param id
   * @param updateProviderDto
   * @param userContext
   * @returns
   */
  async updateProvider(
    id: string,
    updateProviderDto: UpdateProviderDto,
    userContext: UserContextPayload,
  ): Promise<ToolProvider> {
    const provider = await this.getProviderById(id);
    
    // Check if user is owner of the provider
    if (provider.owner.id !== userContext.id) {
      throw new NotFoundException(`Provider with ID ${id} not found`);
    }

    Object.assign(provider, updateProviderDto);
    return this.providersRepository.save(provider);
  }
}
