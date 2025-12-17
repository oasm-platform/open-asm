import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateIssueCommentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  issueId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  createdById: string;
}
