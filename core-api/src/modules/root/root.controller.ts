import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { CreateFirstAdminDto } from './dto/root.dto';
import { RootService } from './root.service';

@Controller('')
export class RootController {
  constructor(private readonly rootService: RootService) {}

  @Get()
  getHealth(): string {
    return this.rootService.getHealth();
  }

  @Public()
  @Doc({
    summary: 'Creates the first admin user in the system.',
    description: 'Creates the first admin user in the system.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post('init-admin')
  createFirstAdmin(@Body() dto: CreateFirstAdminDto) {
    return this.rootService.createFirstAdmin(dto);
  }
}
