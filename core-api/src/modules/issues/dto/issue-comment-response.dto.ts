import { ApiProperty } from '@nestjs/swagger';
import { IssueComment } from '../entities/issue-comment.entity';

export class IssueCommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  createdBy: {
    id: string;
    name: string;
    role: string;
  };

  static fromEntity(comment: IssueComment): IssueCommentResponseDto {
    const dto = new IssueCommentResponseDto();
    dto.id = comment.id;
    dto.content = comment.content;
    dto.createdAt = comment.createdAt;
    dto.updatedAt = comment.updatedAt;
    dto.createdBy = {
      id: comment.createdBy?.id,
      name: comment.createdBy?.name,
      role: comment.createdBy?.role,
    };
    return dto;
  }
}
