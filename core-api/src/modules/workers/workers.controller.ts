import { Public } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  GetManyWorkersDto,
  WorkerAliveDto,
  WorkerJoinDto,
} from './dto/workers.dto';
import { WorkerInstance } from './entities/worker.entity';
import { WorkersService } from './workers.service';

@ApiTags('Workers')
@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) { }

  @Doc({
    summary: 'Worker alive',
    description: 'Confirms the operational status of a security assessment worker node in the cluster.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Public()
  @Post('/alive')
  alive(@Body() dto: WorkerAliveDto) {
    return this.workersService.alive(dto);
  }

  @Doc({
    summary: 'Worker join',
    description: 'Registers a new security assessment worker node to the distributed processing cluster.',
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
    summary: 'Get all workers with pagination and sorting.',
    description: 'Fetches a paginated list of all active security assessment workers in the cluster.',
    response: {
      serialization: GetManyResponseDto(WorkerInstance),
    },
  })
  @Get()
  getWorkers(@Query() query: GetManyWorkersDto) {
    return this.workersService.getWorkers(query);
  }
}
