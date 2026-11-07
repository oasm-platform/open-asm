import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { User } from '../auth/entities/user.entity';
import { AnalyzeVulnerabilityDto } from './dto/analyze-vulnerability.dto';
import {
  BulkDismissVulnerabilitiesDto,
  BulkReopenVulnerabilitiesDto,
  ClaimFixDto,
} from './dto/bulk-vulnerability.dto';
import {
  GetVulnerabilitiesStatisticsQueryDto,
  GetVulnerabilitiesStatisticsResponseDto,
} from './dto/get-vulnerability-statistics.dto';
import { GetVulnerabilitiesQueryDto } from './dto/get-vulnerability.dto';
import {
  ClaimFixResponseDto,
  MergeVulnerabilityResponseDto,
  ReopenVulnerabilitiesResponseDto,
  VulnerabilityDetailDto,
  VulnerabilityDuplicatesResponseDto,
  VulnerabilityListItemDto,
  VulnerabilityReviewResultDto,
  VulnerabilityTimelineResponseDto,
} from './dto/vulnerability-response.dto';
import {
  ApproveVulnerabilityDto,
  MergeVulnerabilityDto,
  RejectVulnerabilityDto,
} from './dto/vulnerability-review.dto';
import {
  UpdateVulnerabilitySettingsDto,
  VulnerabilitySettingsDto,
} from './dto/vulnerability-settings.dto';
import { ScanDto } from './dto/scan.dto';
import { VulnerabilityDismissal } from './entities/vulnerability-dismissal.entity';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityLifecycleService } from './vulnerability-lifecycle.service';
import { VulnerabilityReviewService } from './vulnerability-review.service';

/** Ids of a bulk body, for the audit metadata. */
const bodyIds = (body: unknown, key = 'ids'): string[] => {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(value) ? (value as string[]) : [];
};

@Controller('vulnerabilities')
export class VulnerabilitiesController {
  constructor(
    private readonly vulnerabilitiesService: VulnerabilitiesService,
    private readonly lifecycleService: VulnerabilityLifecycleService,
    private readonly reviewService: VulnerabilityReviewService,
  ) {}

  @Doc({
    summary: 'Scan targets',
    description:
      'Initiates a vulnerability scan for one or more targets. Domain, CIDR and IP targets run the vulnerability_scan_basic workflow (nuclei); Git organization targets run the repository_scan workflow.',
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.write')
  @Post('scan')
  scan(@Body() scanDto: ScanDto, @WorkspaceId() workspaceId: string) {
    return this.vulnerabilitiesService.scan(scanDto.targetIds, workspaceId);
  }

  @Doc({
    summary: 'Get vulnerabilities',
    description:
      'Lists the findings of the workspace. status defaults to open (approved, still detected, not dismissed); pending_review and rejected list AI proposals. Each row carries its lifecycle and review fields, dismissal, a compact source summary and the issue still tracking it.',
    response: {
      serialization: GetManyResponseDto(VulnerabilityListItemDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.read')
  @Get()
  async getVulnerabilities(
    @Query() query: GetVulnerabilitiesQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.vulnerabilitiesService.getVulnerabilities(query, workspaceId);
  }

  @Doc({
    summary: 'Get vulnerabilities statistics',
    description:
      'Open findings per severity, plus lifecycle counts: per detection status, new in 7 days, resurfaced and fixed in 30 days, overdue, AI proposals pending review, and mean time to remediate per severity (findings fixed in the last 90 days).',
    response: {
      serialization: GetVulnerabilitiesStatisticsResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.read')
  @Get('statistics')
  async getVulnerabilitiesStatistics(
    @Query() query: GetVulnerabilitiesStatisticsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.vulnerabilitiesService.getVulnerabilitiesStatistics(
      query,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Get vulnerability management settings',
    description:
      'SLA days per severity, SLA restart on resurface, auto-close of findings covering scans no longer report, and the longest allowed risk acceptance.',
    response: {
      serialization: VulnerabilitySettingsDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.read')
  @Get('settings')
  getSettings(@WorkspaceId() workspaceId: string) {
    return this.lifecycleService.getSettings(workspaceId);
  }

  @Doc({
    summary: 'Update vulnerability management settings',
    description:
      'Partial update; keys left out keep their value. Changing the SLA policy recomputes the due date of every open finding.',
    response: {
      serialization: VulnerabilitySettingsDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.vulnerability.settings.updated, {
    changes: (body) =>
      Object.fromEntries(
        Object.entries((body as Record<string, unknown>) ?? {}).map(
          ([key, value]) => [key, { after: value }],
        ),
      ),
  })
  @WorkspaceAccess('workspace.config')
  @Put('settings')
  updateSettings(
    @WorkspaceId() workspaceId: string,
    @Body() dto: UpdateVulnerabilitySettingsDto,
  ) {
    return this.lifecycleService.updateSettings(workspaceId, dto);
  }

  @Doc({
    summary: 'Claim findings fixed',
    description:
      'Records that the findings were fixed. They stay open until the next scan of the same scope no longer reports them; that scan closes them and notes the claim was verified.',
    response: {
      serialization: ClaimFixResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.vulnerability.status.updated, {
    metadata: (body) => {
      const ids = bodyIds(body, 'vulnerabilityIds');
      return { action: 'claim_fix', count: ids.length, ids };
    },
  })
  @WorkspaceAccess('vulnerability.write')
  @Post('claim-fix')
  @HttpCode(HttpStatus.OK)
  claimFix(
    @WorkspaceId() workspaceId: string,
    @UserContext() user: User,
    @Body() dto: ClaimFixDto,
  ) {
    return this.vulnerabilitiesService.claimFix(
      dto.vulnerabilityIds,
      workspaceId,
      user,
      dto.note,
    );
  }

  @Doc({
    summary: 'Get vulnerability by id',
    description:
      'One finding (AI proposals included) with its lifecycle and review fields, dismissal, open issue and every source with its evidence.',
    response: {
      serialization: VulnerabilityDetailDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.read')
  @Get(':id')
  getVulnerabilityById(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.vulnerabilitiesService.getVulnerability(id, workspaceId);
  }

  @Doc({
    summary: 'Get vulnerability timeline',
    description:
      'What happened to the finding, newest first: detection, status changes, dismissals, fix claims, review decisions.',
    response: {
      serialization: VulnerabilityTimelineResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.read')
  @Get(':id/timeline')
  getVulnerabilityTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.vulnerabilitiesService.getVulnerabilityTimeline(
      id,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Approve an AI proposal',
    description:
      'Turns a pending AI proposal into a finding detected now, optionally with another severity.',
    response: {
      serialization: VulnerabilityReviewResultDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.vulnerability.review.approved, {
    resourceIdFromRoute: true,
    metadata: (body) => {
      const severity = (body as ApproveVulnerabilityDto | undefined)?.severity;
      const metadata: Record<string, string> = {};
      if (severity) metadata.severity = severity;
      return metadata;
    },
  })
  @WorkspaceAccess('vulnerability.write')
  @Post(':id/review/approve')
  @HttpCode(HttpStatus.OK)
  approveProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: User,
    @Body() dto: ApproveVulnerabilityDto,
  ) {
    return this.reviewService.approve(id, dto, user, workspaceId);
  }

  @Doc({
    summary: 'Reject an AI proposal',
    description: 'Rejects a pending AI proposal; the reason is required.',
    response: {
      serialization: VulnerabilityReviewResultDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.vulnerability.review.rejected, {
    resourceIdFromRoute: true,
  })
  @WorkspaceAccess('vulnerability.write')
  @Post(':id/review/reject')
  @HttpCode(HttpStatus.OK)
  rejectProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: User,
    @Body() dto: RejectVulnerabilityDto,
  ) {
    return this.reviewService.reject(id, dto, user, workspaceId);
  }

  @Doc({
    summary: 'Merge an AI proposal into a finding',
    description:
      'Moves the proposal’s sources (agent evidence, tools) to an approved finding of the workspace and deletes the proposal.',
    response: {
      serialization: MergeVulnerabilityResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.vulnerability.review.merged, {
    resourceIdFromRoute: true,
    metadata: (body) => ({
      targetVulnerabilityId:
        (body as MergeVulnerabilityDto | undefined)?.targetVulnerabilityId ?? '',
    }),
  })
  @WorkspaceAccess('vulnerability.write')
  @Post(':id/review/merge')
  @HttpCode(HttpStatus.OK)
  mergeProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: User,
    @Body() dto: MergeVulnerabilityDto,
  ) {
    return this.reviewService.merge(id, dto, user, workspaceId);
  }

  @Doc({
    summary: 'Possible duplicates of an AI proposal',
    description:
      'Approved findings on the same asset sharing a CWE or CVE, the affected URL, or key words of the name.',
    response: {
      serialization: VulnerabilityDuplicatesResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.read')
  @Get(':id/review/duplicates')
  getProposalDuplicates(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.reviewService.duplicates(id, workspaceId);
  }

  @Doc({
    summary: 'Analyze a vulnerability',
    description:
      'Initiates an AI-powered analysis of a specific security vulnerability to provide detailed insights and recommendations.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.write')
  @Post(':id/analyze')
  @HttpCode(HttpStatus.OK)
  async analyzeVulnerability(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: User,
    @Body() dto: AnalyzeVulnerabilityDto,
  ) {
    return this.vulnerabilitiesService.analyzeVulnerability(
      id,
      workspaceId,
      user.id,
      dto.forceRerun ?? false,
    );
  }

  @Doc({
    summary: 'Delete vulnerability analysis result',
    description:
      'Removes the AI analysis result from a vulnerability and resets its status to not analyzed.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('vulnerability.write')
  @Delete(':id/analyze')
  async deleteVulnerabilityAnalysis(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.vulnerabilitiesService.deleteVulnerabilityAnalysis(
      id,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Bulk dismiss vulnerabilities',
    description:
      'Dismisses findings: false positive, used in test, won’t fix, or risk accepted until expiresAt (at most riskAcceptMaxDays ahead; the finding reopens afterwards).',
    response: {
      serialization: VulnerabilityDismissal,
      isArray: true,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.vulnerability.status.updated, {
    metadata: (body) => {
      const ids = bodyIds(body);
      const dto = body as Partial<BulkDismissVulnerabilitiesDto> | undefined;
      return {
        action: 'dismiss',
        count: ids.length,
        ids,
        ...(dto?.reason ? { reason: dto.reason } : {}),
        ...(dto?.expiresAt ? { expiresAt: dto.expiresAt } : {}),
      };
    },
  })
  @WorkspaceAccess('vulnerability.write')
  @Post('dismiss')
  bulkDismissVulnerabilities(
    @WorkspaceId() workspaceId: string,
    @UserContext() user: User,
    @Body() dto: BulkDismissVulnerabilitiesDto,
  ) {
    return this.vulnerabilitiesService.bulkDismissVulnerabilities(
      dto.ids,
      workspaceId,
      user,
      dto,
    );
  }

  @Doc({
    summary: 'Bulk reopen vulnerabilities',
    description:
      'Removes the dismissal of the given findings (vulnerability ids), so they count as open again.',
    response: {
      serialization: ReopenVulnerabilitiesResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.vulnerability.bulk_updated, {
    metadata: (body) => {
      const ids = bodyIds(body);
      return { action: 'reopen', count: ids.length, ids };
    },
  })
  @WorkspaceAccess('vulnerability.write')
  @Post('reopen')
  bulkReopenVulnerabilities(
    @WorkspaceId() workspaceId: string,
    @UserContext() user: User,
    @Body() dto: BulkReopenVulnerabilitiesDto,
  ) {
    return this.vulnerabilitiesService.bulkReopenVulnerabilities(
      dto.ids,
      workspaceId,
      user,
    );
  }
}
