import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { TargetsService } from './targets.service';
import { CreateTargetDto } from './dto/targets.dto';
import { UserContext } from 'src/common/decorators/app.decorator';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { Doc } from 'src/common/doc/doc.decorator';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { Target } from './entities/target.entity';

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
}
