import { Body, Controller, Post } from '@nestjs/common';
import { TargetsService } from './targets.service';
import { CreateTargetDto } from './dto/targets.dto';
import { UserContext } from 'src/common/decorators/app.decorator';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { Doc } from 'src/common/doc/doc.decorator';

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
    console.log('dto', dto);
    return this.targetsService.createTarget(dto, userContext);
  }
}
