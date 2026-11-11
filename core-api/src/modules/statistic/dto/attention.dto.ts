import { ApiProperty } from '@nestjs/swagger';
import { InsightLevel } from '../../targets/dto/target-overview.dto';
import { WorkspaceInsightKind } from '../workspace-insights';

/** Something in the workspace worth acting on, computed at read time. */
export class WorkspaceInsightDto {
  @ApiProperty({ enum: WorkspaceInsightKind, enumName: 'WorkspaceInsightKind' })
  kind: WorkspaceInsightKind;

  @ApiProperty({ enum: InsightLevel, enumName: 'InsightLevel' })
  level: InsightLevel;

  @ApiProperty()
  count: number;

  @ApiProperty({ required: false, description: 'Window of the count, in days' })
  days?: number;
}

export class WorkspaceAttentionResponseDto {
  @ApiProperty({ type: [WorkspaceInsightDto], description: 'Worst first; empty when all is well' })
  insights: WorkspaceInsightDto[];
}
