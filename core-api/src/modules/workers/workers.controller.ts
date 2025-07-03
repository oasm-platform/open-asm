import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { WorkersService } from './workers.service';
import { WorkerAliveDto } from './dto/workers.dto';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Public } from 'src/common/decorators/app.decorator';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { Doc } from 'src/common/doc/doc.decorator';
import { WorkerInstance } from './entities/worker.entity';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Public()
  @Post('/alive')
  alive(@Body() dto: WorkerAliveDto) {
    return this.workersService.alive(dto);
  }

  @Doc({
    summary: 'Worker join',
    description: 'Worker join the cluster',
    response: {
      serialization: WorkerInstance,
    },
  })
  @Public()
  @Post('join')
  join(@Body() dto: WorkerJoinDto) {
    return this.workersService.join(dto);
  }

  @Doc({
    summary: 'Gets all workers with pagination and sorting.',
    response: {
      serialization: GetManyBaseResponseDto<WorkerInstance>,
    },
  })
  @Get()
  getWorkers(@Query() query: GetManyBaseQueryParams) {
    return this.workersService.getWorkers(query);
  }
}
