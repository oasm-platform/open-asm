import { applyDecorators, HttpStatus, SetMetadata } from '@nestjs/common';
import {
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { IDocOptions, IDocResponseOptions } from './doc.interface';
import { AppResponseSerialization } from './response.serialization';

export const RESPONSE_DOCS_METADATA = 'RESPONSE_DOCS_METADATA';

export function Doc<T>(options?: IDocOptions<T>): MethodDecorator {
  const decorators: MethodDecorator[] = [];

  decorators.push(ApiConsumes(getContentType(options?.request?.bodyType)));
  decorators.push(ApiProduces('application/json'));
  decorators.push(DocDefault(options?.response || {}));

  if (options?.request?.params?.length) {
    decorators.push(...options.request.params.map(ApiParam));
  }

  if (options?.request?.queries?.length) {
    decorators.push(...options.request.queries.map(ApiQuery));
  }

  if (options?.description || options?.summary) {
    decorators.push(
      ApiOperation({
        description: options.description,
        summary: options.summary,
      }),
    );
  }

  decorators.push(SetMetadata(RESPONSE_DOCS_METADATA, true));

  return applyDecorators(...decorators);
}

function getContentType(bodyType?: 'FORM_DATA' | 'JSON'): string {
  return bodyType === 'FORM_DATA' ? 'multipart/form-data' : 'application/json';
}

function DocDefault<T>({
  dataSchema,
  description,
  extraModels = [],
  httpStatus = HttpStatus.OK,
  messageExample,
  serialization,
}: IDocResponseOptions): MethodDecorator {
  const decorators: MethodDecorator[] = [];

  const schema: Record<string, any> = {
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
  extraModels.forEach((model) => decorators.push(ApiExtraModels(model)));

  decorators.push(
    ApiResponse({
      description,
      status: httpStatus,
      schema,
    }),
  );

  return applyDecorators(...decorators);
}
