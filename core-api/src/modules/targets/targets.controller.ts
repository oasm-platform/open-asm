import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { UserContext } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { CreateTargetDto, GetManyTargetResponseDto } from './dto/targets.dto';
import { Target } from './entities/target.entity';
import { TargetsService } from './targets.service';

@Controller('targets')
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Doc({
    summary: 'Create a target',
    description: 'Creates a new target.',
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
    summary: 'Get a target by ID',
    description: 'Retrieves a target by its ID.',
    response: {
      serialization: Target,
    },
  })
  @Get(':id')
  getTarget(@Param() { id }: IdQueryParamDto) {
    const target = this.targetsService.getTargetById(id);

    if (!target) {
      throw new NotFoundException('Target not found');
    }
    return target;
  }

  @Doc({
    summary: 'Get all targets in a workspace',
    description: 'Retrieves all targets in a workspace.',
    response: {
      serialization: GetManyResponseDto(GetManyTargetResponseDto),
    },
  })
  @Get('workspace/:id')
  getTargetsInWorkspace(
    @Param() { id }: IdQueryParamDto,
    @Query() query: GetManyBaseQueryParams,
  ) {
    return this.targetsService.getTargetsInWorkspace(id, query);
  }

  @Doc({
    summary: 'Delete a target from a workspace',
    description: 'Deletes a target from a workspace.',
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
    description: 'Rescans a target and triggers a new scan job.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post(':id/re-scan')
  reScanTarget(@Param() { id }: IdQueryParamDto) {
    return this.targetsService.assetService.reScan(id);
  }
}
