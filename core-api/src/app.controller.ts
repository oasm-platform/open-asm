import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from './modules/auth/auth.guard';
import { Public } from './modules/auth/decorators';

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
