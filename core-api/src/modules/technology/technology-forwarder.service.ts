/* eslint-disable no-magic-numbers */
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../services/redis/redis.service';
import { TechnologyDetailDTO } from './dto/technology-detail.dto';

interface CategoryInfo {
  groups: number[];
  name: string;
  priority: number;
}

interface TechnologyWithCategory extends TechnologyDetailDTO {
  categories?: CategoryInfo[];
  categoryNames?: string[];
}

@Injectable()
export class TechnologyForwarderService {
  private readonly logger = new Logger(TechnologyForwarderService.name);
  private readonly CACHE_KEY_PREFIX = 'technology:';
  private readonly CATEGORY_CACHE_KEY = 'categories';
  private readonly CACHE_TTL = 60 * 60 * 24 * 30;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Fetch technology information from the webappanalyzer repository
   * @param techName The name of the technology to fetch
   * @returns Technology information or null if not found
   */
  async fetchTechnologyInfo(
    techName: string,
  ): Promise<TechnologyWithCategory | null> {
    try {
      const cached = await this.getCachedTechnologyInfo(techName);
      if (cached) {
        return cached;
      }

      const firstChar = techName.charAt(0).toLowerCase();
      const fileName = /^[a-z]$/.test(firstChar)
        ? `${firstChar}.json`
        : '_.json';

      const url = `https://raw.githubusercontent.com/oasm-platform/webappanalyzer/main/src/technologies/${fileName}`;

      const response = await fetch(url);

      const data: Record<string, unknown> = (await response.json()) as Record<
        string,
        unknown
      >;

      if (data && data[techName]) {
        const techInfo = data[techName] as TechnologyDetailDTO;

        const categories = await this.getCategoriesForTechnology(techInfo);

        const categoryNames =
          categories?.map((category) => category.name) || [];

        const enrichedTechInfo: TechnologyWithCategory = {
          ...techInfo,
          categories: categories,
          categoryNames: categoryNames,
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
  ): Promise<TechnologyWithCategory | null> {
    try {
      const key = `${this.CACHE_KEY_PREFIX}${techName}`;
      const cached = await this.redisService.client.get(key);

      if (cached) {
        return JSON.parse(cached) as TechnologyWithCategory;
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
    techInfo: TechnologyWithCategory,
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
  ): Promise<{ name: string; info: TechnologyWithCategory | null }[]> {
    const enrichedTechs = await Promise.all(
      techNames.map(async (techName) => ({
        name: techName,
        info: await this.fetchTechnologyInfo(techName),
      })),
    );

    return enrichedTechs;
  }

  /**
   * Get categories information from the webappanalyzer repository
   * @returns Categories information
   */
  private async fetchCategories(): Promise<Record<
    string,
    CategoryInfo
  > | null> {
    try {
      // Check if we have categories in cache first
      const cachedCategories = await this.getCachedCategories();
      if (cachedCategories) {
        return cachedCategories;
      }

      const url =
        'https://raw.githubusercontent.com/oasm-platform/webappanalyzer/main/src/categories.json';

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch categories data: ${response.statusText}`,
        );
      }

      const categories: Record<string, CategoryInfo> =
        (await response.json()) as Record<string, CategoryInfo>;

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
    CategoryInfo
  > | null> {
    try {
      const cached = await this.redisService.client.get(
        this.CATEGORY_CACHE_KEY,
      );

      if (cached) {
        return JSON.parse(cached) as Record<string, CategoryInfo>;
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
    categories: Record<string, CategoryInfo>,
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
  ): Promise<CategoryInfo[] | undefined> {
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
   * @returns The full URL to the icon
   */
  getIconUrl(iconName: string): string {
    if (!iconName) {
      return '';
    }

    // Determine the file extension
    const extension = iconName.includes('.') ? '' : '.svg';
    return `https://raw.githubusercontent.com/oasm-platform/webappanalyzer/main/src/images/icons/${iconName}${extension}`;
  }
}

