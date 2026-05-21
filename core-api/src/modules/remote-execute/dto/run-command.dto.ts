import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class RunCommandDto {
  @ApiProperty({
    description: 'Command to execute',
    example: 'nmap -sV 10.0.0.1',
  })
  @IsString()
  command: string;

  @ApiProperty({
    description: 'Session ID for the remote execution stream',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  sessionId: string;
}
