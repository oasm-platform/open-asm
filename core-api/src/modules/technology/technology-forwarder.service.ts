import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { WEBAPP_ANALYZER_SRC_URL } from '../../common/constants/app.constants';
import { RedisService } from '../../services/redis/redis.service';
import { StorageService } from '../storage/storage.service';
import {
  CategoryInfoDTO,
  TechnologyDetailDTO,
} from './dto/technology-detail.dto';

@Injectable()
export class TechnologyForwarderService implements OnModuleInit {
  private readonly logger = new Logger(TechnologyForwarderService.name);
  private readonly CACHE_KEY_PREFIX = 'technology:';
  private readonly CATEGORY_CACHE_KEY = 'categories';
  private readonly CACHE_TTL = 60 * 60 * 24 * 30;

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
   * Fetches each file with 1-second delay to avoid rate limiting
   * Stores individual technologies with key format: technology:${techName}
   */
  private async fetchAndCacheAllTechnologies(): Promise<void> {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
    let successCount = 0;
    let errorCount = 0;
    let totalTechnologiesCached = 0;

    for (const letter of alphabet) {
      try {
        const fileName = `${letter}.json`;
        const url = `${WEBAPP_ANALYZER_SRC_URL}/technologies/${fileName}`;
        this.logger.debug(`Fetching technology data from: ${url}`);
        const rawKey = this.CACHE_KEY_PREFIX + 'status:' + fileName;
        const cachedRaw = await this.redisService.cacheClient.get(rawKey);
        if (cachedRaw) {
          continue;
        }
        const response = await fetch(url);

        if (response.ok) {
          const data: Record<string, unknown> =
            (await response.json()) as Record<string, unknown>;

          await this.redisService.cacheClient.set(rawKey, 'true');
          // Cache each technology individually with key: technology:${techName}
          let technologiesInFile = 0;
          for (const [techName, techData] of Object.entries(data)) {
            try {
              const techKey = `technology:${techName}`;

              // Check if already cached
              const existing = await this.redisService.cacheClient.get(techKey);
              if (!existing) {
                // Cache without expiration (permanent storage)
                await this.redisService.cacheClient.set(
                  techKey,
                  JSON.stringify(techData),
                );
                technologiesInFile++;
                totalTechnologiesCached++;
              }
            } catch (techError) {
              this.logger.error(
                `Error caching technology ${techName}:`,
                techError,
              );
            }
          }

          successCount++;
          this.logger.debug(
            `Successfully cached ${technologiesInFile} technologies from file: ${fileName}`,
          );
        } else if (response.status === 404) {
          // File doesn't exist, skip with debug log
          this.logger.debug(
            `Technology file ${fileName} not found (404), skipping...`,
          );
          successCount++; // Count as success since 404 is expected for some files
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // 1-second delay to avoid rate limiting
        if (letter !== 'z') {
          // Don't delay after the last file
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        errorCount++;
        this.logger.error(
          `Error fetching technology file ${letter}.json:`,
          error,
        );

        // Continue with next file even if current one fails
        continue;
      }
    }

    this.logger.log(
      `Technology data fetch completed. Files: ${successCount}, Errors: ${errorCount}, Total technologies cached: ${totalTechnologiesCached}`,
    );
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

    const luaScript = `
      local prefix = ARGV[1]
      local keys = {}
      for i = 2, #ARGV do
        keys[i-1] = prefix .. ARGV[i]
      end
      return redis.call('MGET', unpack(keys))
    `;

    try {
      const results = (await this.redisService.cacheClient.eval(
        luaScript,
        0,
        this.CACHE_KEY_PREFIX,
        ...techNames,
      )) as (string | null)[];

      return Promise.all(
        techNames.map(async (techName, index) => {
          const cached = results[index];
          if (cached) {
            try {
              const techInfo = JSON.parse(cached) as TechnologyDetailDTO;
              techInfo.name = techName;

              // Enrich with categories
              const categories =
                await this.getCategoriesForTechnology(techInfo);
              const categoryNames =
                categories?.map((category) => category.name) || [];

              return {
                ...techInfo,
                categories,
                categoryNames,
                iconUrl: techInfo.icon
                  ? await this.getIconUrl(techInfo.icon)
                  : '',
              };
            } catch (parseError) {
              this.logger.error(
                `Error parsing cached data for ${techName}:`,
                parseError,
              );
              return new TechnologyDetailDTO();
            }
          } else {
            return new TechnologyDetailDTO();
          }
        }),
      );
    } catch (error) {
      this.logger.error('Error in batch enriching technologies:', error);
      // Fallback to empty DTOs
      return techNames.map(() => new TechnologyDetailDTO());
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
    // Determine the file extension
    const hasDot = iconName.includes('.');
    const extension = hasDot ? '' : '.svg';
    const url = `${WEBAPP_ANALYZER_SRC_URL}/images/icons/${iconName}${extension}`;

    // Extract actual extension for bucket
    const actualExt = hasDot ? iconName.split('.').pop() : 'svg';
    const bucket = `cached-static`;
    const fileName = `${createHash('md5').update(url).digest('hex')}.${actualExt}`;

    try {
      // Fetch the image
      const { buffer } = await this.storageService.forwardImage(url);

      // Upload to storage
      const uploadResult = this.storageService.uploadFile(
        fileName,
        buffer,
        bucket,
      );

      // Return the path
      return `/api/storage/${uploadResult.path}`;
    } catch (error) {
      this.logger.error(`Error processing icon ${iconName}:`, error);
      return '';
    }
  }
}
