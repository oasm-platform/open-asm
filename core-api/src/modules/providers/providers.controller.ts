import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Doc } from 'src/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { UserContext } from '../../common/decorators/app.decorator';
import { UserContextPayload } from '../../common/interfaces/app.interface';
import { CreateProviderDto, ProvidersQueryDto, UpdateProviderDto } from './dto';
import { ToolProvider } from './entities';
import { ProvidersService } from './providers.service';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Doc({
    summary: 'Get all providers',
    description: 'Get all providers with pagination, filtered by owner',
    response: {
      serialization: GetManyResponseDto(ToolProvider),
    },
  })
  @Get()
  async getManyProviders(
    @Query() query: ProvidersQueryDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.providersService.getManyProviders(query, userContext);
  }

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
  getProvider(@Param('id') id: string) {
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
    return this.providersService.updateProvider(
      id,
      updateProviderDto,
      userContext,
    );
  }

  @Doc({
    summary: 'Delete a provider',
    description: 'Soft delete a provider by ID',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete(':id')
  deleteProvider(
    @Param('id') id: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.providersService.deleteProvider(id, userContext);
  }
}
