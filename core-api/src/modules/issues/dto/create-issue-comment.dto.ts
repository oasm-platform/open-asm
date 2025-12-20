import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateIssueCommentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  repCommentId?: string;
}
