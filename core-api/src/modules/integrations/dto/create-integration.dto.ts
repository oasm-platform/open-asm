import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateIntegrationDto {
  @ApiProperty({ example: 'My Jira Integration', description: 'Human-readable name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false, description: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 'jira', description: 'Third-party app identifier' })
  @IsString()
  appType: string;

  @ApiProperty({ example: 'ticketing', description: 'Integration category' })
  @IsString()
  category: string;

  @ApiProperty({
    description: 'App-specific configuration validated via JSON Schema',
    example: {
      host: 'https://your-domain.atlassian.net',
      email: 'user@example.com',
      apiToken: 'your-api-token',
    },
  })
  @IsObject()
  config: Record<string, unknown>;
}
