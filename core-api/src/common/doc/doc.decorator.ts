import { applyDecorators, HttpStatus, SetMetadata } from '@nestjs/common';
import {
  ApiConsumes,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import type { IDocOptions, IDocResponseOptions } from './doc.interface';
import { AppResponseSerialization } from './response.serialization';

export const RESPONSE_DOCS_METADATA = 'RESPONSE_DOCS_METADATA';

/**
 * Apply common decorators for API documentation
 * @param options Documentation options
 * @returns Array of method decorators
 */
function applyCommonDecorators<T>(options?: IDocOptions<T>): MethodDecorator[] {
  const decorators: MethodDecorator[] = [];
  decorators.push(ApiConsumes(getContentType(options?.request?.bodyType)));
  decorators.push(ApiProduces('application/json'));
  decorators.push(DocDefault(options?.response || {}));

  return decorators;
}

/**
 * Apply parameter decorators for API documentation
 * @param options Documentation options
 * @returns Array of method decorators
 */
 
function applyParamDecorators<T>(options?: IDocOptions<T>): MethodDecorator[] {
  const decorators: MethodDecorator[] = [];

  if (options?.request?.getWorkspaceId) {
    decorators.push(
      ApiHeader({
        name: 'X-Workspace-Id',
        description: 'Workspace ID',
        required: true,
      }),
    );
  }

  if (options?.request?.params?.length) {
    decorators.push(...options.request.params.map(ApiParam));
  }

  if (options?.request?.queries?.length) {
    decorators.push(...options.request.queries.map(ApiQuery));
  }

  return decorators;
}

/**
 * Apply operation decorators for API documentation
 * @param options Documentation options
 * @returns Array of method decorators
 */
function applyOperationDecorators<T>(
  options?: IDocOptions<T>,
): MethodDecorator[] {
  const decorators: MethodDecorator[] = [];

  if (options?.description || options?.summary) {
    decorators.push(
      ApiOperation({
        description: options.description,
        summary: options.summary,
      }),
    );
  }

  return decorators;
}

/**
 * Decorator for documenting API endpoints with Swagger
 * @param options Documentation options
 * @returns Method decorator
 */
export function Doc<T>(options?: IDocOptions<T>): MethodDecorator {
  const decorators: MethodDecorator[] = [];

  // Apply common decorators
  decorators.push(...applyCommonDecorators(options));

  // Apply parameter decorators
  decorators.push(...applyParamDecorators(options));

  // Apply operation decorators
  decorators.push(...applyOperationDecorators(options));

  // Add metadata
  decorators.push(SetMetadata(RESPONSE_DOCS_METADATA, true));

  return applyDecorators(...decorators);
}

/**
 * Get content type based on body type
 * @param bodyType Body type
 * @returns Content type string
 */
function getContentType(bodyType?: 'FORM_DATA' | 'JSON'): string {
  return bodyType === 'FORM_DATA' ? 'multipart/form-data' : 'application/json';
}

/**
 * Create default documentation response
 * @param options Response options
 * @returns Method decorator
 */
function DocDefault<T>({
  dataSchema,
  description,
  extraModels = [],
  httpStatus = HttpStatus.OK,
  serialization,
}: Omit<IDocResponseOptions<T>, 'messageExample'>): MethodDecorator {
  const decorators: MethodDecorator[] = [];

  const schema: Record<string, unknown> = {
    allOf: [{ $ref: getSchemaPath(AppResponseSerialization<T>) }],
  };

  if (dataSchema) {
    Object.assign(schema, dataSchema);
  } else if (serialization) {
    decorators.push(ApiExtraModels(serialization));
    Object.assign(schema, {
      $ref: getSchemaPath(serialization),
    });
  }

  // Always include AppResponseSerialization and extra models
  decorators.push(ApiExtraModels(AppResponseSerialization<T>));
  extraModels.forEach((model) => {
    if (model) {
      decorators.push(ApiExtraModels(model));
    }
  });

  decorators.push(
    ApiResponse({
      description,
      status: httpStatus,
      schema,
    }),
  );

  return applyDecorators(...decorators);
}
