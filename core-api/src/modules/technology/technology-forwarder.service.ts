import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { WEBAPP_ANALYZER_SRC_URL } from '../../common/constants/app.constants';
import { RedisService } from '../../services/redis/redis.service';
import { StorageService } from '../storage/storage.service';
import {
  CategoryInfoDTO,
  TechnologyDetailDTO,
} from './dto/technology-detail.dto';

/**
 * Custom error for file not found scenarios
 */
class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}

@Injectable()
export class TechnologyForwarderService implements OnModuleInit {
  private readonly logger = new Logger(TechnologyForwarderService.name);
  private readonly CACHE_KEY_PREFIX = 'technology:';
  private readonly CATEGORY_CACHE_KEY = 'categories';
  private readonly CACHE_TTL = 60 * 60 * 24 * 30;

  // Constants for file processing
  private readonly FETCH_DELAY_MS = 1000;
  private readonly ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
  private readonly STATUS_TRUE = 'true';
  private readonly DEFAULT_ICON_EXTENSION = 'svg';
  private readonly ICONS_BUCKET = 'cached-static';

  constructor(
    private readonly redisService: RedisService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Initialize module and fetch all technology data on startup
   * This method is called automatically when the module is initialized
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Starting technology data initialization...');

    try {
      await this.fetchAndCacheAllTechnologies();
      this.logger.log('Technology data initialization completed successfully');
    } catch (error) {
      this.logger.error('Error during technology data initialization:', error);
    }
  }

  /**
   * Fetch and cache all technology data from A-Z files
   * Fetches each file with delay to avoid rate limiting
   * Stores individual technologies with key format: technology:${techName}
   */
  private async fetchAndCacheAllTechnologies(): Promise<void> {
    const stats = { successCount: 0, errorCount: 0, totalTechnologiesCached: 0 };

    for (const letter of this.ALPHABET) {
      try {
        const result = await this.processTechnologyFile(letter);
        stats.successCount += result.isSuccess ? 1 : 0;
        stats.errorCount += result.isError ? 1 : 0;
        stats.totalTechnologiesCached += result.technologiesCached;

        if (letter !== 'z') {
          await this.delay(this.FETCH_DELAY_MS);
        }
      } catch (error) {
        stats.errorCount++;
        this.logger.error(`Error processing technology file ${letter}.json:`, error);
      }
    }

    this.logger.log(
      `Technology data fetch completed. Files: ${stats.successCount}, Errors: ${stats.errorCount}, Total technologies cached: ${stats.totalTechnologiesCached}`,
    );
  }

  /**
   * Process a single technology file for a given letter
   * @param letter The letter representing the file to process
   * @returns Processing result with success status and cached count
   */
  private async processTechnologyFile(letter: string): Promise<{
    isSuccess: boolean;
    isError: boolean;
    technologiesCached: number;
  }> {
    const fileName = `${letter}.json`;
    const statusKey = `${this.CACHE_KEY_PREFIX}status:${fileName}`;

    // Skip if already processed
    if (await this.isFileAlreadyProcessed(statusKey)) {
      return { isSuccess: true, isError: false, technologiesCached: 0 };
    }

    try {
      const data = await this.fetchTechnologyFileData(fileName);
      const technologiesCached = await this.cacheTechnologiesFromData(data);

      await this.redisService.cacheClient.set(statusKey, this.STATUS_TRUE);

      this.logger.debug(
        `Successfully cached ${technologiesCached} technologies from file: ${fileName}`,
      );

      return { isSuccess: true, isError: false, technologiesCached };
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        this.logger.debug(`Technology file ${fileName} not found (404), skipping...`);
        return { isSuccess: true, isError: false, technologiesCached: 0 };
      }

      throw error;
    }
  }

  /**
   * Check if a technology file has already been processed
   * @param statusKey The Redis key for the file status
   * @returns True if already processed
   */
  private async isFileAlreadyProcessed(statusKey: string): Promise<boolean> {
    const cached = await this.redisService.cacheClient.get(statusKey);
    return cached === this.STATUS_TRUE;
  }

  /**
   * Fetch technology data from a specific file
   * @param fileName The name of the file to fetch
   * @returns The parsed JSON data
   */
  private async fetchTechnologyFileData(fileName: string): Promise<Record<string, unknown>> {
    const url = `${WEBAPP_ANALYZER_SRC_URL}/technologies/${fileName}`;
    this.logger.debug(`Fetching technology data from: ${url}`);

    const response = await fetch(url);

    if (response.status === 404) {
      throw new FileNotFoundError(`File ${fileName} not found`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  /**
   * Cache individual technologies from parsed data
   * @param data The parsed technology data
   * @returns Number of technologies cached
   */
  private async cacheTechnologiesFromData(data: Record<string, unknown>): Promise<number> {
    let cachedCount = 0;

    for (const [techName, techData] of Object.entries(data)) {
      try {
        const techKey = `${this.CACHE_KEY_PREFIX}${techName}`;

        if (!(await this.redisService.cacheClient.get(techKey))) {
          await this.redisService.cacheClient.set(techKey, JSON.stringify(techData));
          cachedCount++;
        }
      } catch (techError) {
        this.logger.error(`Error caching technology ${techName}:`, techError);
      }
    }

    return cachedCount;
  }

  /**
   * Create a delay promise
   * @param ms Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch technology information from the webappanalyzer repository
   * @param techName The name of the technology to fetch
   * @returns Technology information or null if not found
   */
  async fetchTechnologyInfo(
    techName: string,
  ): Promise<TechnologyDetailDTO | null> {
    try {
      const data = await this.getCachedTechnologyInfo(techName);
      if (data) {
        const techInfo = data;
        techInfo.name = techName;

        const categories = await this.getCategoriesForTechnology(techInfo);

        const categoryNames =
          categories?.map((category) => category.name) || [];

        const enrichedTechInfo: TechnologyDetailDTO = {
          ...techInfo,
          categories,
          categoryNames,
          iconUrl: techInfo.icon ? await this.getIconUrl(techInfo.icon) : '',
        };

        await this.cacheTechnologyInfo(techName, enrichedTechInfo);

        return enrichedTechInfo;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error fetching technology info for ${techName}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get cached technology information from Redis
   * @param techName The name of the technology
   * @returns Cached technology information or null if not found
   */
  public async getCachedTechnologyInfo(
    techName: string,
  ): Promise<TechnologyDetailDTO | null> {
    try {
      const key = `${this.CACHE_KEY_PREFIX}${techName}`;
      const cached = await this.redisService.cacheClient.get(key);

      if (cached) {
        return JSON.parse(cached) as TechnologyDetailDTO;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error getting cached technology info for ${techName}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache technology information in Redis
   * @param techName The name of the technology
   * @param techInfo The technology information to cache
   */
  private async cacheTechnologyInfo(
    techName: string,
    techInfo: TechnologyDetailDTO,
  ): Promise<void> {
    try {
      const key = `${this.CACHE_KEY_PREFIX}${techName}`;
      await this.redisService.cacheClient.setex(
        key,
        this.CACHE_TTL,
        JSON.stringify(techInfo),
      );
    } catch (error) {
      this.logger.error(
        `Error caching technology info for ${techName}:`,
        error,
      );
    }
  }

  /**
   * Enrich technology names with full information using batch Redis Lua script
   * @param techNames Array of technology names
   * @returns Array of enriched technology information
   */
  async enrichTechnologies(
    techNames: string[],
  ): Promise<TechnologyDetailDTO[]> {
    if (techNames.length === 0) {
      return [];
    }

    try {
      const cachedResults = await this.batchGetCachedTechnologies(techNames);
      return await Promise.all(
        techNames.map((techName, index) =>
          this.enrichSingleTechnology(techName, cachedResults[index])
        )
      );
    } catch (error) {
      this.logger.error('Error in batch enriching technologies:', error);
      return techNames.map(() => new TechnologyDetailDTO());
    }
  }

  /**
   * Get cached technology data for multiple technologies in batch
   * @param techNames Array of technology names
   * @returns Array of cached data strings or null
   */
  private async batchGetCachedTechnologies(techNames: string[]): Promise<(string | null)[]> {
    const luaScript = `
      local prefix = ARGV[1]
      local keys = {}
      for i = 2, #ARGV do
        keys[i-1] = prefix .. ARGV[i]
      end
      return redis.call('MGET', unpack(keys))
    `;

    return await this.redisService.cacheClient.eval(
      luaScript,
      0,
      this.CACHE_KEY_PREFIX,
      ...techNames,
    ) as (string | null)[];
  }

  /**
   * Enrich a single technology with categories and icon URL
   * @param techName The name of the technology
   * @param cachedData The cached JSON string or null
   * @returns Enriched technology DTO
   */
  private async enrichSingleTechnology(
    techName: string,
    cachedData: string | null
  ): Promise<TechnologyDetailDTO> {
    if (!cachedData) {
      return new TechnologyDetailDTO();
    }

    try {
      const techInfo = JSON.parse(cachedData) as TechnologyDetailDTO;
      techInfo.name = techName;

      const categories = await this.getCategoriesForTechnology(techInfo);
      const categoryNames = categories?.map(category => category.name) || [];

      return {
        ...techInfo,
        categories,
        categoryNames,
        iconUrl: techInfo.icon ? await this.getIconUrl(techInfo.icon) : '',
      };
    } catch (parseError) {
      this.logger.error(`Error parsing cached data for ${techName}:`, parseError);
      return new TechnologyDetailDTO();
    }
  }

  /**
   * Get categories information from the webappanalyzer repository
   * @returns Categories information
   */
  private async fetchCategories(): Promise<Record<
    string,
    CategoryInfoDTO
  > | null> {
    try {
      // Check if we have categories in cache first
      const cachedCategories = await this.getCachedCategories();
      if (cachedCategories) {
        return cachedCategories;
      }

      const url = `${WEBAPP_ANALYZER_SRC_URL}/categories.json`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch categories data: ${response.statusText}`,
        );
      }

      const categories: Record<string, CategoryInfoDTO> =
        (await response.json()) as Record<string, CategoryInfoDTO>;

      // Cache the categories
      await this.cacheCategories(categories);

      return categories;
    } catch (error) {
      this.logger.error('Error fetching categories:', error);
      return null;
    }
  }

  /**
   * Get cached categories from Redis
   * @returns Cached categories or null if not found
   */
  private async getCachedCategories(): Promise<Record<
    string,
    CategoryInfoDTO
  > | null> {
    try {
      const cached = await this.redisService.cacheClient.get(
        this.CATEGORY_CACHE_KEY,
      );

      if (cached) {
        return JSON.parse(cached) as Record<string, CategoryInfoDTO>;
      }

      return null;
    } catch (error) {
      this.logger.error('Error getting cached categories:', error);
      return null;
    }
  }

  /**
   * Cache categories in Redis
   * @param categories The categories to cache
   */
  private async cacheCategories(
    categories: Record<string, CategoryInfoDTO>,
  ): Promise<void> {
    try {
      await this.redisService.cacheClient.setex(
        this.CATEGORY_CACHE_KEY,
        this.CACHE_TTL,
        JSON.stringify(categories),
      );
    } catch (error) {
      this.logger.error('Error caching categories:', error);
    }
  }

  /**
   * Get categories for a specific technology
   * @param techInfo The technology information
   * @returns Array of category information
   */
  private async getCategoriesForTechnology(
    techInfo: TechnologyDetailDTO,
  ): Promise<CategoryInfoDTO[] | undefined> {
    if (!techInfo.cats || techInfo.cats.length === 0) {
      return undefined;
    }

    const categories = await this.fetchCategories();
    if (!categories) {
      return undefined;
    }

    return techInfo.cats
      .map((catId) => categories[catId.toString()])
      .filter((category) => category !== undefined);
  }

  /**
   * Get the icon URL for a technology
   * @param iconName The name of the icon
   * @returns The path of bucket + fileName
   */
  async getIconUrl(iconName: string): Promise<string> {
    if (!iconName) {
      return '';
    }

    try {
      const { url, fileName } = this.buildIconPaths(iconName);
      const { buffer } = await this.storageService.forwardImage(url);
      const uploadResult = this.storageService.uploadFile(
        fileName,
        buffer,
        this.ICONS_BUCKET,
      );

      return `/api/storage/${uploadResult.path}`;
    } catch (error) {
      this.logger.error(`Error processing icon ${iconName}:`, error);
      return '';
    }
  }

  /**
   * Build the source URL and target file name for an icon
   * @param iconName The name of the icon
   * @returns Object containing the source URL and target file name
   */
  private buildIconPaths(iconName: string): { url: string; fileName: string } {
    const hasExtension = iconName.includes('.');
    const extension = hasExtension ? '' : `.${this.DEFAULT_ICON_EXTENSION}`;
    const url = `${WEBAPP_ANALYZER_SRC_URL}/images/icons/${iconName}${extension}`;

    const actualExtension = hasExtension
      ? iconName.split('.').pop() || this.DEFAULT_ICON_EXTENSION
      : this.DEFAULT_ICON_EXTENSION;

    const fileName = `${createHash('md5').update(url).digest('hex')}.${actualExtension}`;

    return { url, fileName };
  }
}
