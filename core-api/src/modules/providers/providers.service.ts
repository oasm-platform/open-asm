import { UserContextPayload } from '@/common/interfaces/app.interface';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { CreateProviderDto } from './dto/create-provider.dto';
import { ProvidersQueryDto } from './dto/providers-query.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ToolProvider } from './entities/provider.entity';

/**
 * Owner projection for provider responses. Per AGENTS.md a user response only
 * ever exposes `id`, `name` and `image` — never email/role/ban fields.
 */
type ProviderOwner = Pick<User, 'id' | 'name' | 'image'>;

export type ProviderResponse = Omit<ToolProvider, 'owner'> & {
  owner: ProviderOwner;
};

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(ToolProvider)
    private readonly providersRepository: Repository<ToolProvider>,
  ) {}

  /**
   * Get all providers with pagination, filtered by owner
   * @param query
   * @param userContext
   * @returns
   */
  async getManyProviders(
    query: ProvidersQueryDto,
    userContext: UserContextPayload,
  ) {
    const { page = 1, limit = 10, name } = query;
    const skip = (page - 1) * limit;

    const whereConditions: Record<string, unknown> = {
      owner: { id: userContext.id },
    };

    // Add name filter if provided
    if (name) {
      whereConditions.name = ILike(`%${name}%`);
    }

    const [data, total] = await this.providersRepository.findAndCount({
      where: whereConditions,
      take: limit,
      skip: skip,
      order: {
        name: 'ASC',
      },
    });

    return getManyResponse({ query, data, total });
  }

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
   * Loads a provider and asserts the caller owns it.
   *
   * `ToolProvider` is user-owned (it has no workspace relation), so the
   * authenticated user is the authorization boundary. A provider that does not
   * exist and one owned by somebody else are both reported as not found so the
   * route never confirms the existence of another user's provider.
   *
   * @param id
   * @param userContext
   * @returns
   */
  private async findOwnedProvider(
    id: string,
    userContext: UserContextPayload,
  ): Promise<ToolProvider> {
    const provider = await this.providersRepository.findOne({
      where: { id },
      relations: {
        owner: true,
      },
    });

    if (!provider || provider.owner?.id !== userContext.id) {
      throw new NotFoundException(`Provider with ID ${id} not found`);
    }

    return provider;
  }

  /**
   * Get a provider by ID
   * @param id
   * @param userContext
   * @returns
   */
  async getProviderById(
    id: string,
    userContext: UserContextPayload,
  ): Promise<ProviderResponse> {
    const provider = await this.findOwnedProvider(id, userContext);

    return {
      ...provider,
      owner: {
        id: provider.owner.id,
        name: provider.owner.name,
        image: provider.owner.image,
      },
    };
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
  ): Promise<ProviderResponse> {
    // Check if user is owner of the provider
    const provider = await this.findOwnedProvider(id, userContext);

    Object.assign(provider, updateProviderDto);
    const saved = await this.providersRepository.save(provider);

    return {
      ...saved,
      owner: {
        id: provider.owner.id,
        name: provider.owner.name,
        image: provider.owner.image,
      },
    };
  }

  /**
   * Soft delete a provider by ID
   * @param id
   * @param userContext
   * @returns
   */
  async deleteProvider(
    id: string,
    userContext: UserContextPayload,
  ): Promise<{ message: string }> {
    // Check if user is owner of the provider
    await this.findOwnedProvider(id, userContext);

    // Soft delete the provider
    await this.providersRepository.softDelete(id);

    return { message: 'Provider deleted successfully' };
  }
}
