import { VulnerabilitySeverityCounts } from '@/common/dtos/vulnerability-severity-counts.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class TopAssetVulnerabilities extends VulnerabilitySeverityCounts {
    @ApiProperty({
        example: 'asset-id-123',
        description: 'The ID of the asset',
    })
    @IsString()
    id: string;

    @ApiProperty({
        example: 'example.com',
        description: 'The value of the asset',
    })
    @IsString()
    value: string;
}
