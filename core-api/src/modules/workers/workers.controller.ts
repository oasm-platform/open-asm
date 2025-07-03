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
  @Doc({
    summary: 'Checks if a worker is alive.',
  })
  @Get(':workerNameId/alive')
  alive(
    @Req() req: Request,
    @Res() res: Response,
    @Param() { workerNameId }: WorkerAliveDto,
  ) {
    return this.workersService.alive(req, res, workerNameId);
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
