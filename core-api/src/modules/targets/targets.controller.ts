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
import { TargetsService } from './targets.service';
import { CreateTargetDto } from './dto/targets.dto';
import { UserContext } from 'src/common/decorators/app.decorator';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { Doc } from 'src/common/doc/doc.decorator';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { Target } from './entities/target.entity';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';

@Controller('targets')
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Doc({
    summary: 'Create a target',
    description: 'Creates a new target.',
    response: {
      serialization: DefaultMessageResponseDto,
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
      serialization: GetManyResponseDto<Target>,
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
  ) {
    return this.targetsService.deleteTargetFromWorkspace(id, workspaceId);
  }
}
