import { Controller, Get } from '@nestjs/common';
import { UserContext } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { GetApiKeyResponseDto } from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Doc({
    summary: 'Get API key',
    description: 'Get API key',
    response: {
      serialization: GetApiKeyResponseDto,
    },
  })
  @Get('api-key')
  getApiKey(@UserContext() user: UserContextPayload) {
    return this.usersService.getApiKey(user.id);
  }

  @Doc({
    summary: 'Regenerate API key',
    description: 'Regenerates the API key for a user.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
  })
  @Get('api-key/regenerate')
  regenerateApiKey(@UserContext() user: UserContextPayload) {
    return this.usersService.regenerateApiKey(user.id);
  }
}
