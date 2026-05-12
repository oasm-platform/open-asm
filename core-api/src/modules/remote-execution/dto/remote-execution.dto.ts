import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum CliCommandType {
  EXEC = 'EXEC',
  CANCEL = 'CANCEL',
}

export enum CliOutputType {
  STDOUT = 'stdout',
  STDERR = 'stderr',
  EXIT = 'exit',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

export interface RemoteExecutionSession {
  sessionId: string;
  workerId: string;
  workspaceId: string;
  status: 'active' | 'disconnected' | 'closed';
  createdAt: Date;
  createdBy: string;
}

export class CreateSessionDto {
  @ApiProperty()
  @IsUUID('4')
  workerId: string;

  @ApiProperty()
  @IsUUID('4')
  workspaceId: string;
}

export class SendCommandDto {
  @ApiProperty({ example: 'ls -la', required: false })
  @IsString()
  @IsOptional()
  command?: string;

  @ApiProperty({ enum: CliCommandType })
  @IsEnum(CliCommandType)
  type: CliCommandType;
}

export class CliOutputDto {
  @ApiProperty()
  @IsString()
  sessionId: string;

  @ApiProperty({ enum: CliOutputType })
  @IsEnum(CliOutputType)
  type: CliOutputType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  data?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  exitCode?: number;
}
