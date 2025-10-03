import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserContext, WorkspaceId } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import {
  CreateTargetDto,
  GetManyTargetResponseDto,
  GetManyWorkspaceQueryParamsDto,
  UpdateTargetDto,
} from './dto/targets.dto';
import { Target } from './entities/target.entity';
import { TargetsService } from './targets.service';

@Controller('targets')
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Doc({
    summary: 'Create a target',
    description: 'Registers a new security testing target such as a domain, IP address, or network range for vulnerability assessment and continuous monitoring.',
    response: {
      serialization: Target,
    },
  })
  @Post()
  createTarget(
    @Body() dto: CreateTargetDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.targetsService.createTarget(dto, userContext);
  }

  @Doc({
    summary: 'Get all targets in a workspace',
    description: 'Fetches a comprehensive list of all registered security testing targets within the specified workspace for vulnerability management and assessment tracking.',
    response: {
      serialization: GetManyResponseDto(GetManyTargetResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  getTargetsInWorkspace(
    @Query() query: GetManyWorkspaceQueryParamsDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.targetsService.getTargetsInWorkspace(query, workspaceId);
  }

  @Doc({
    summary: 'Get a target by ID',
    description: 'Fetches detailed information about a specific security testing target using its unique identifier, including configuration and assessment status.',
    response: {
      serialization: Target,
    },
  })
  @Get(':id')
  getTargetById(@Param() { id }: IdQueryParamDto) {
    return this.targetsService.getTargetById(id);
  }

  @Doc({
    summary: 'Delete a target from a workspace',
    description: 'Removes a security testing target from the specified workspace, terminating all associated monitoring and assessment activities.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete(':id/workspace/:workspaceId')
  deleteTargetFromWorkspace(
    @Param() { id }: IdQueryParamDto,
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' }))
    workspaceId: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.targetsService.deleteTargetFromWorkspace(
      id,
      workspaceId,
      userContext,
    );
  }

  @Doc({
    summary: 'Rescan a target',
    description: 'Initiates a comprehensive security re-assessment of the specified target, triggering new vulnerability scans to identify potential security risks.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post(':id/re-scan')
  reScanTarget(@Param() { id }: IdQueryParamDto) {
    return this.targetsService.assetService.reScan(id);
  }

  @Doc({
    summary: 'Update a target',
    description: 'Modifies the configuration and properties of an existing security testing target, allowing for dynamic adjustments to assessment parameters.',
    response: {
      serialization: Target,
    },
  })
  @Patch(':id')
  updateTarget(@Param() { id }: IdQueryParamDto, @Body() dto: UpdateTargetDto) {
    return this.targetsService.updateTarget(id, dto);
  }
}
