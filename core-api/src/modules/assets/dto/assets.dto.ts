import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Job } from 'src/modules/jobs-registry/entities/job.entity';

export class GetAssetsResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;
  @ApiProperty()
  value: string;
  @ApiProperty()
  targetId: string;
  @ApiProperty({ required: false })
  isPrimary?: boolean;
  @ApiProperty()
  createdAt: Date;
  @ApiProperty()
  updatedAt: Date;
  @ApiProperty({ required: false })
  dnsRecords?: object;

  @ApiProperty({ type: Job, required: false })
  workerResults: Record<string, any>;
}
