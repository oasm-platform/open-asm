import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { WorkerAliveDto, WorkerJoinDto } from './dto/workers.dto';
import { WorkerInstance } from './entities/worker.entity';
import { WorkersService } from './workers.service';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Workers')
@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Doc({
    summary: 'Worker alive',
    description: 'Worker alive',
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
      serialization: GetManyResponseDto(WorkerInstance),
    },
  })
  @Get()
  getWorkers(@Query() query: GetManyBaseQueryParams) {
    return this.workersService.getWorkers(query);
  }
}
