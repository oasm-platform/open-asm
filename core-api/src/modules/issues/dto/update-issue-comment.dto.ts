import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateIssueCommentDto {
  @ApiProperty({
    description: 'Content of the comment',
    example: 'This is an updated comment',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000) // Limit comment length to 10KB
  content: string;
}
