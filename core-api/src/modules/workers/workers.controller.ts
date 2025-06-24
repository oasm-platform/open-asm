import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { WorkerAliveDto } from './dto/workers.dto';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Public } from 'src/common/decorators/app.decorator';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Public()
  @Get(':workerNameId/alive')
  alive(
    @Req() req: Request,
    @Res() res: Response,
    @Param() { workerNameId }: WorkerAliveDto,
  ) {
    return this.workersService.alive(req, res, workerNameId);
  }
}
