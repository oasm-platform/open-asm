import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for the schemas endpoint.
 * Returns the full JSON Schema (Draft 2020-12) that the console uses
 * to render dynamic forms for each integration app_type + category.
 */
export class SchemasResponseDto {
  @ApiProperty({
    description: 'JSON Schema (Draft 2020-12) with oneOf discriminated union by app_type + category',
  })
  schema: Record<string, unknown>;
}
