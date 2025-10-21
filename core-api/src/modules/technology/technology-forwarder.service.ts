
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { WEBAPP_ANALYZER_SRC_URL } from '../../common/constants/app.constants';
import { RedisService } from '../../services/redis/redis.service';
import { StorageService } from '../storage/storage.service';
import {
  CategoryInfoDTO,
  TechnologyDetailDTO,
} from './dto/technology-detail.dto';

@Injectable()
export class TechnologyForwarderService {
  private readonly logger = new Logger(TechnologyForwarderService.name);
  private readonly CACHE_KEY_PREFIX = 'technology:';
  private readonly CATEGORY_CACHE_KEY = 'categories';
  private readonly CACHE_TTL = 60 * 60 * 24 * 30;

  constructor(
    private readonly redisService: RedisService,
    private readonly storageService: StorageService,
  ) { }

  /**
   * Fetch technology information from the webappanalyzer repository
   * @param techName The name of the technology to fetch
   * @returns Technology information or null if not found
   */
  async fetchTechnologyInfo(
    techName: string,
  ): Promise<TechnologyDetailDTO | null> {
    try {
      const cached = await this.getCachedTechnologyInfo(techName);
      if (cached) {
        return cached;
      }

      const firstChar = techName.charAt(0).toLowerCase();
      const fileName = /^[a-z]$/.test(firstChar)
        ? `${firstChar}.json`
        : '_.json';

      const url = `${WEBAPP_ANALYZER_SRC_URL}/technologies/${fileName}`;

      const response = await fetch(url);

      const data: Record<string, unknown> = (await response.json()) as Record<
        string,
        unknown
      >;

      if (data && data[techName]) {
        const techInfo = data[techName] as TechnologyDetailDTO;
        techInfo.name = techName;

        const categories = await this.getCategoriesForTechnology(techInfo);

        const categoryNames =
          categories?.map((category) => category.name) || [];

        const enrichedTechInfo: TechnologyDetailDTO = {
          ...techInfo,
          categories: categories,
          categoryNames: categoryNames,
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
  private async getCachedTechnologyInfo(
    techName: string,
  ): Promise<TechnologyDetailDTO | null> {
    try {
      const key = `${this.CACHE_KEY_PREFIX}${techName}`;
      const cached = await this.redisService.client.get(key);

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
      await this.redisService.client.setex(
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
   * Enrich technology names with full information
   * @param techNames Array of technology names
   * @returns Array of enriched technology information
   */
  async enrichTechnologies(
    techNames: string[],
  ): Promise<TechnologyDetailDTO[]> {
    const enrichedTechs = await Promise.all(
      techNames.map(
        async (techName) =>
          (await this.fetchTechnologyInfo(techName)) ??
          new TechnologyDetailDTO(),
      ),
    );
    return enrichedTechs;
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
      const cached = await this.redisService.client.get(
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
      await this.redisService.client.setex(
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
      const uploadResult = this.storageService.uploadFile(fileName, buffer, bucket);

      // Return the path
      return `/api/storage/${uploadResult.path}`;
    } catch (error) {
      this.logger.error(`Error processing icon ${iconName}:`, error);
      return '';
    }
  }
}
