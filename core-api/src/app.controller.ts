import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/common.decorator';
import { AuthGuard } from './common/guards/auth.guard';

@Controller()
@UseGuards(AuthGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}
  @Get('/')
  @Public()
  healthCheck() {
    return this.appService.healthCheck();
  }
}
