import { IssueCommentType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Longest comment body accepted (10k characters). */
export const COMMENT_MAX_LENGTH = 10000;

export class CreateCommentDto {
  @ApiProperty({ maxLength: COMMENT_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_MAX_LENGTH)
  content: string;

  @ApiProperty({
    required: false,
    description: 'Comment this one replies to; must be on the same subject.',
  })
  @IsOptional()
  @IsUUID()
  repCommentId?: string;
}

export class UpdateCommentDto {
  @ApiProperty({ maxLength: COMMENT_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_MAX_LENGTH)
  content: string;
}

/** A user as responses expose them: id, name and image only. */
export class CommentAuthorDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  image?: string | null;
}

/** The comment a reply points at, shortened. */
export class RepliedCommentDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'First characters of the replied-to comment' })
  snippet: string;

  @ApiProperty({ description: 'The replied-to comment has been deleted' })
  deleted: boolean;

  @ApiProperty({ type: () => CommentAuthorDto, nullable: true })
  author: CommentAuthorDto | null;
}

export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: IssueCommentType })
  type: IssueCommentType;

  @ApiProperty({ required: false, nullable: true, type: String })
  issueId: string | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  vulnerabilityId: string | null;

  @ApiProperty()
  isCanEdit: boolean;

  @ApiProperty()
  isCanDelete: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: () => CommentAuthorDto, nullable: true })
  author: CommentAuthorDto | null;

  @ApiProperty({ type: () => RepliedCommentDto, nullable: true })
  repComment: RepliedCommentDto | null;
}
