import { Type } from '@nestjs/common';
import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
/**
 * Returns a `GetManyResponseDto` object, which is a standardized response
 * object for GET many endpoints.
 *
 * @param query - The query parameters that were used to fetch the data.
 * @param data - The array of entities that were fetched.
 * @param total - The total number of entities that match the query.
 */
export function getManyResponse<T>(
  query: GetManyBaseQueryParams,
  data: T[],
  total: number,
): GetManyBaseResponseDto<T> {
  const { limit, page } = query;
  return {
    data,
    total: +total,
    page: +page,
    limit: +limit,
    pageCount: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
  };
}

export function GetManyResponseDto<T>(model: Type<T>) {
  class PaginatedDto extends GetManyBaseResponseDto<T> {
    @ApiProperty({ isArray: true, type: () => model })
    declare data: T[];
  }

  Object.defineProperty(PaginatedDto, 'name', {
    value: `GetMany${model.name}Dto`,
  });

  ApiExtraModels(model)(PaginatedDto);
  ApiExtraModels(PaginatedDto);

  return PaginatedDto;
}
