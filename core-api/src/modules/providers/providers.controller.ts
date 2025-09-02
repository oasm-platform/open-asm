import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Doc } from 'src/common/doc/doc.decorator';
import { UserContext } from '../../common/decorators/app.decorator';
import { UserContextPayload } from '../../common/interfaces/app.interface';
import { CreateProviderDto, UpdateProviderDto } from './dto';
import { ToolProvider } from './entities';
import { ProvidersService } from './providers.service';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Doc({
    summary: 'Create a new provider',
    description: 'Create a new provider',
    response: {
      serialization: ToolProvider,
    },
  })
  @Post()
  async createProvider(
    @Body() createProviderDto: CreateProviderDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.providersService.createProvider(createProviderDto, userContext);
  }

  @Doc({
    summary: 'Get a provider by ID',
    description: 'Get detailed information about a specific provider',
    response: {
      serialization: ToolProvider,
    },
  })
  @Get(':id')
  async getProvider(@Param('id') id: string) {
    return this.providersService.getProviderById(id);
  }

  @Doc({
    summary: 'Update a provider',
    description: 'Update an existing provider by ID',
    response: {
      serialization: ToolProvider,
    },
  })
  @Patch(':id')
  async updateProvider(
    @Param('id') id: string,
    @Body() updateProviderDto: UpdateProviderDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.providersService.updateProvider(id, updateProviderDto, userContext);
  }
}
