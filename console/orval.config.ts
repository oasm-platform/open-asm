import { config } from 'dotenv';
import { defineConfig } from 'orval';
config();

export default defineConfig({
  api: {
    output: {
      target: 'src/services/apis/gen/queries.ts',
      prettier: true,
      clean: true,
      client: 'react-query',
      override: {
        useTypeOverInterfaces: true,
        query: {
          useInfinite: true,
          useQuery: true,
          useInfiniteQueryParam: 'page',
        },
        mutator: {
          path: 'src/services/apis/axios-client.ts',
          name: 'orvalClient',
        },
      },
    },
    input: {
      validation: false,
      target: '../open-api/open-api.json',
    },
  },
});
