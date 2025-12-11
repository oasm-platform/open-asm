/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from 'dotenv';
import { defineConfig } from 'orval';
import * as fs from 'fs';
import * as path from 'path';

config();

const getInfiniteOverrides = () => {
  const operations: Record<string, any> = {};
  const inputPath = path.resolve(__dirname, '../.open-api/open-api.json');

  const fileContent = fs.readFileSync(inputPath, 'utf-8');
  const doc = JSON.parse(fileContent);

  Object.values(doc.paths || {}).forEach((pathItem: any) => {
    ['get', 'post', 'put', 'patch', 'delete'].forEach((method) => {
      if (pathItem[method]) {
        const operation = pathItem[method];
        const operationId = operation.operationId;

        if (!operationId) return;

        const allParams = [
          ...(pathItem.parameters || []),
          ...(operation.parameters || []),
        ];

        const hasPageParam = allParams.some((p: any) => p.name === 'page');

        if (hasPageParam) {
          operations[operationId] = {
            query: {
              useInfinite: true,
              useInfiniteQueryParam: 'page',
            },
          };
        }
      }
    });
  });

  return operations;
};

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
          useQuery: true,
        },
        mutator: {
          path: 'src/services/apis/axios-client.ts',
          name: 'orvalClient',
        },
        operations: getInfiniteOverrides(),
      },
    },
    input: {
      validation: false,
      target: '../.open-api/open-api.json',
    },
  },
});
