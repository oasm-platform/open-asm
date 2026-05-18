import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RunCommandDto {
  @ApiProperty({
    description: 'Command to execute',
    example: 'nmap -sV 10.0.0.1',
  })
  @IsString()
  command: string;
}
