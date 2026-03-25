import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  llmConfigId: string;

  @ApiProperty({ example: 'My conversation', required: false })
  @IsOptional()
  @IsString()
  title?: string;
}

export class UpdateConversationDto {
  @ApiProperty({ example: 'Updated title', required: false })
  @IsOptional()
  @IsString()
  title?: string;
}

export class ConversationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  llmConfigId: string;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class GetConversationsResponseDto {
  @ApiProperty({ type: [ConversationResponseDto] })
  conversations: ConversationResponseDto[];

  @ApiProperty()
  totalCount: number;
}
