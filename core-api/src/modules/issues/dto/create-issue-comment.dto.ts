import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateIssueCommentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  content: string;
}
