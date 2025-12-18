import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { WorkspaceOwnerGuard } from '@/common/guards/workspace-owner.guard';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AssetsService } from './assets.service';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetStatusCodeAssetsDTO } from './dto/get-status-code-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
import { SwitchAssetDto } from './dto/switch-asset.dto';
import { GetTlsResponseDto } from './dto/tls.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { GetHostAssetsDTO } from './dto/get-host-assets.dto';

@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Doc({
    summary: 'Get assets in target',
    description: 'Retrieves a list of assets associated with the given target.',
    response: {
      serialization: GetManyResponseDto(GetAssetsResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  getAssetsInWorkspace(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getManyAsssetServices(query, workspaceId);
  }

  @Doc({
    summary: 'Get IP asset',
    description: 'Retrieves a list of ip with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetIpAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/ip')
  getIpAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getIpAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get host asset',
    description: 'Retrieves a list of host with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetHostAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/host')
  getHostAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getHostAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get ports and number of assets',
    description: 'Retrieves a list of port with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetPortAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/port')
  getPortAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getPortAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get technologies along with number of assets',
    description: 'Retrieves a list of technologies with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetTechnologyAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/tech')
  getTechnologyAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getTechnologyAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get technologies along with number of assets',
    description: 'Retrieves a list of technologies with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetStatusCodeAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/status-code')
  getStatusCodeAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getStatusCodeAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get TLS certificates',
    description: 'Retrieves a list of TLS certificates expiring soon.',
    response: {
      serialization: GetManyResponseDto(GetTlsResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/tls')
  getTlsAssets(@WorkspaceId() workspaceId: string) {
    return this.assetsService.getManyTls(workspaceId);
  }

  @Doc({
    summary: 'Get asset by ID',
    description: 'Retrieves a single asset by its ID.',
    response: {
      serialization: GetAssetsResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':id')
  getAssetById(@Param('id') id: string, @WorkspaceId() workspaceId: string) {
    return this.assetsService.getAssetById(id, workspaceId);
  }

  @Doc({
    summary: 'Update asset by ID',
    description: 'Updates an asset by its ID. Only tags can be updated.',
    response: {
      serialization: GetAssetsResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Patch(':id')
  updateAssetById(
    @Param('id') id: string,
    @Body() updateAssetDto: UpdateAssetDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.updateAssetById(id, updateAssetDto, workspaceId);
  }

  @Doc({
    summary: 'Switch asset enabled/disabled',
    description: 'Toggle the enabled/disabled status of an asset.',
    response: {
      serialization: GetAssetsResponseDto,
    },
  })
  @Post('/switch')
  switchAsset(@Body() switchAssetDto: SwitchAssetDto) {
    return this.assetsService.switchAsset(
      switchAssetDto.assetId,
      switchAssetDto.isEnabled,
    );
  }

  @Doc({
    summary: 'Export services to CSV',
    description:
      'Exports all services in a workspace to a CSV file containing value, ports, technologies, and TLS information for reporting and analysis purposes.',
    response: {
      description: 'CSV file containing services data',
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @UseGuards(WorkspaceOwnerGuard)
  @Get('services/export')
  async exportServicesToCSV(
    @WorkspaceId() workspaceId: string,
    @Res() res: Response,
  ) {
    // Helper function to format date as DD-MM-YYYY
    const formatDate = (date: Date | null | undefined): string => {
      if (!date) return '';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Get services data for CSV export
    const services = await this.assetsService.exportServicesForCSV(workspaceId);

    // Create CSV content
    const csvRows: string[] = [];
    // Add header row
    csvRows.push(
      'value,ports,techs,tls_host,tls_sni,tls_subject_dn,tls_not_after,tls_not_before,tls_connection',
    );

    // Add data rows
    for (const service of services) {
      const portsFormatted = service.ports ? service.ports.join(',') : '';
      const techsFormatted = service.techs ? service.techs.join(',') : '';
      const tlsHost = service.tls?.host || '';
      const tlsSni = service.tls?.sni || '';
      const tlsSubjectDn = service.tls?.subject_dn || '';
      const tlsNotAfter = service.tls?.not_after
        ? formatDate(new Date(service.tls.not_after))
        : '';
      const tlsNotBefore = service.tls?.not_before
        ? formatDate(new Date(service.tls.not_before))
        : '';
      const tlsConnection = service.tls?.tls_connection || '';

      const row = `"${service.value.replace(/"/g, '""')}","${portsFormatted}","${techsFormatted}","${tlsHost}","${tlsSni}","${tlsSubjectDn}","${tlsNotAfter}","${tlsNotBefore}","${tlsConnection}"`;
      csvRows.push(row);
    }

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="services_${workspaceId}.csv"`,
    );
    res.setHeader('Content-Length', Buffer.byteLength(csvRows.join('\n')));

    // Send CSV content
    res.send(csvRows.join('\n'));
  }
}
