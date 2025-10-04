import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { API_KEY_LENGTH } from 'src/common/constants/app.constants';
import { ApiKeyType } from 'src/common/enums/enum';
import { generateToken } from 'src/utils/genToken';
import { Repository } from 'typeorm';
import { CreateApiKeyDto } from './dto/create-apikey.dto';
import { UpdateApiKeyDto } from './dto/update-apikey.dto';
import { ApiKey } from './entities/apikey.entity';

/**
 * Service for managing API keys
 * Provides methods for creating, retrieving, updating, and deleting API keys
 */
@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    public apiKeysRepository: Repository<ApiKey>,
  ) { }

  /**
   * Finds an API key by its key value
   * @param key - The key value of the API key
   * @returns The API key entity
   * @throws NotFoundException if the API key with the given key value is not found
   */
  async findByKey(key: string): Promise<ApiKey> {
    const apiKey = await this.apiKeysRepository.findOne({ where: { key, isRevoked: false } });
    if (!apiKey) {
      throw new NotFoundException(`API key with key ${key} not found`);
    }
    return apiKey;
  }

  /**
   * Retrieves the current API key by type and reference ID
   * @param type - The type of the API key
   * @param refId - The reference ID of the API key
   * @returns The API key entity
   * @throws NotFoundException if the API key with the given type and reference ID is not found
   */
  public async getCurrentApiKey(
    type: ApiKeyType,
    ref?: string,
  ): Promise<ApiKey | null> {
    const apiKey = await this.apiKeysRepository.findOne({
      where: { type, ref, isRevoked: false },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return apiKey;
  }

  /**
   * Creates a new API key
   * @param createApiKeyDto - Data transfer object containing API key creation data
   * @returns The created API key entity
   */
  async create(createApiKeyDto: CreateApiKeyDto, length = API_KEY_LENGTH): Promise<ApiKey> {
    const apiKey = new ApiKey();
    apiKey.name = createApiKeyDto.name;
    apiKey.type = createApiKeyDto.type;
    apiKey.key = generateToken(length);
    apiKey.isRevoked = false;
    apiKey.ref = createApiKeyDto.ref;
    await this.apiKeysRepository
      .createQueryBuilder('apiKey')
      .update(ApiKey)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where({
        type: createApiKeyDto.type,
        ref: createApiKeyDto.ref,
        isRevoked: false,
      })
      .execute();
    return this.apiKeysRepository.save(apiKey);
  }
  /**
   * Retrieves a single API key by its ID
   * @param id - The unique identifier of the API key
   * @returns The API key entity
   * @throws NotFoundException if the API key with the given ID is not found
   */
  async findOne(id: string): Promise<ApiKey> {
    const apiKey = await this.apiKeysRepository.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }
    return apiKey;
  }

  /**
   * Updates an existing API key
   * @param id - The unique identifier of the API key to update
   * @param updateApiKeyDto - Data transfer object containing the update data
   * @returns The updated API key entity
   * @throws NotFoundException if the API key with the given ID is not found
   */
  async update(id: string, updateApiKeyDto: UpdateApiKeyDto): Promise<ApiKey> {
    // First check if the API key exists
    await this.findOne(id);
    // Update the API key
    await this.apiKeysRepository.update(id, updateApiKeyDto);
    // Return the updated API key
    return this.findOne(id);
  }

  /**
   * Removes an API key permanently
   * @param id - The unique identifier of the API key to remove
   * @throws NotFoundException if the API key with the given ID is not found
   */
  async remove(id: string): Promise<void> {
    // First check if the API key exists
    await this.findOne(id);
    // Remove the API key
    await this.apiKeysRepository.delete(id);
  }

  /**
   * Revokes an API key, making it invalid for future requests
   * @param id - The unique identifier of the API key to revoke
   * @returns The revoked API key entity
   * @throws NotFoundException if the API key with the given ID is not found
   */
  async revoke(id: string): Promise<ApiKey> {
    // First get the API key (this will throw if not found)
    const apiKey = await this.findOne(id);
    // Update the API key
    apiKey.isRevoked = true;
    apiKey.revokedAt = new Date();
    return this.apiKeysRepository.save(apiKey);
  }
}
