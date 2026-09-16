import {
  CATEGORY_DATA_SOURCE_MAP,
  DataSource,
  ToolCategory,
} from './enum';

describe('ToolCategory — url_discovery contract', () => {
  describe('S1: url_discovery category + data source', () => {
    it('exposes URL_DISCOVERY === "url_discovery"', () => {
      expect(ToolCategory.URL_DISCOVERY).toBe('url_discovery');
    });

    it('maps URL_DISCOVERY to DataSource.ASSET_SERVICE', () => {
      expect(CATEGORY_DATA_SOURCE_MAP[ToolCategory.URL_DISCOVERY]).toBe(
        DataSource.ASSET_SERVICE,
      );
    });
  });

  describe('S2: exhaustive category coverage', () => {
    it('every ToolCategory value has exactly one entry in CATEGORY_DATA_SOURCE_MAP', () => {
      const categories = Object.values(ToolCategory);
      const mapKeys = Object.keys(CATEGORY_DATA_SOURCE_MAP);

      expect(mapKeys.sort()).toEqual([...categories].sort());

      for (const category of categories) {
        expect(CATEGORY_DATA_SOURCE_MAP[category]).toBeDefined();
      }
    });
  });

  describe('S3 regression: existing category mappings', () => {
    it('SUBDOMAINS → ASSET', () => {
      expect(CATEGORY_DATA_SOURCE_MAP[ToolCategory.SUBDOMAINS]).toBe(
        DataSource.ASSET,
      );
    });

    it('HTTP_PROBE and SCREENSHOT → ASSET_SERVICE', () => {
      expect(CATEGORY_DATA_SOURCE_MAP[ToolCategory.HTTP_PROBE]).toBe(
        DataSource.ASSET_SERVICE,
      );
      expect(CATEGORY_DATA_SOURCE_MAP[ToolCategory.SCREENSHOT]).toBe(
        DataSource.ASSET_SERVICE,
      );
    });

    it('PORTS_SCANNER and VULNERABILITIES → ASSET', () => {
      expect(CATEGORY_DATA_SOURCE_MAP[ToolCategory.PORTS_SCANNER]).toBe(
        DataSource.ASSET,
      );
      expect(CATEGORY_DATA_SOURCE_MAP[ToolCategory.VULNERABILITIES]).toBe(
        DataSource.ASSET,
      );
    });
  });
});
