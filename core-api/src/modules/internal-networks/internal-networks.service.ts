import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOperator, Like, Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateInternalNetworkDto } from './dtos/create-internal-network.dto';
import {
  GetInternalNetworkResponseDto,
  GetManyInternalNetworksQueryDto,
  GetManyInternalNetworksResponseDto,
} from './dtos/get-many-internal-networks.dto';
import {
  GetManyNetworkInterfacesQueryDto,
  GetManyNetworkInterfacesResponseDto,
} from './dtos/get-many-network-interfaces.dto';
import { UpdateInternalNetworkDto } from './dtos/update-internal-network.dto';
import { InternalNetwork } from './entities/internal-network.entity';
import { NetworkInterface } from './entities/network-interface.entity';

@Injectable()
export class InternalNetworksService {
  constructor(
    @InjectRepository(InternalNetwork)
    private readonly internalNetworkRepository: Repository<InternalNetwork>,
    @InjectRepository(NetworkInterface)
    private readonly networkInterfaceRepository: Repository<NetworkInterface>,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async getManyInternalNetworks(
    query: GetManyInternalNetworksQueryDto,
    workspaceId: string,
  ): Promise<GetManyInternalNetworksResponseDto> {
    const { page, limit, sortBy, sortOrder, search } = query;
    const skip = (page - 1) * limit;

    const where: { workspaceId: string; name?: FindOperator<string> } = {
      workspaceId,
    };
    if (search) {
      where.name = Like(`%${search}%`);
    }

    const [networks, total] = await this.internalNetworkRepository.findAndCount(
      {
        where,
        relations: ['creator'],
        order: { [sortBy]: sortOrder },
        skip,
        take: limit,
      },
    );

    const data = networks.map((network) => ({
      id: network.id,
      name: network.name,
      createdAt: network.createdAt,
      updatedAt: network.updatedAt,
      createdBy: {
        id: network.creator?.id || '',
        name: network.creator?.name || '',
        image: network.creator?.image || '',
      },
    }));

    const pageCount = Math.ceil(total / limit);
    const hasNextPage = page * limit < total;

    return {
      data,
      total,
      page,
      limit,
      hasNextPage,
      pageCount,
    };
  }

  async createInternalNetwork(
    dto: CreateInternalNetworkDto,
    workspaceId: string,
    user: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    // Check if workspace exists and user is owner
    await this.workspacesService.getWorkspaceByIdAndOwner(workspaceId, user);

    // Create internal network

    await this.internalNetworkRepository.save({
      name: dto.name,
      workspaceId,
      createdBy: user.id,
    });

    return { message: 'Internal network created successfully' };
  }

  async updateInternalNetworkById(
    id: string,
    dto: UpdateInternalNetworkDto,
    user: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    // Find internal network with workspace

    const internalNetwork = await this.internalNetworkRepository.findOne({
      where: { id },
      relations: ['workspace'],
    });
    if (!internalNetwork) {
      throw new NotFoundException('Internal network not found');
    }
    // Check workspace ownership

    await this.workspacesService.getWorkspaceByIdAndOwner(
      internalNetwork.workspaceId,
      user,
    );

    // Update name if provided
    if (dto.name !== undefined) {
      internalNetwork.name = dto.name;

      await this.internalNetworkRepository.save(internalNetwork);
    }

    return { message: 'Internal network updated successfully' };
  }

  async deleteInternalNetwork(
    id: string,
    user: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    // Find internal network with workspace

    const internalNetwork = await this.internalNetworkRepository.findOne({
      where: { id },
      relations: ['workspace'],
    });
    if (!internalNetwork) {
      throw new NotFoundException('Internal network not found');
    }
    // Check workspace ownership

    await this.workspacesService.getWorkspaceByIdAndOwner(
      internalNetwork.workspaceId,
      user,
    );

    // Delete
    await this.internalNetworkRepository.remove(internalNetwork);

    return { message: 'Internal network deleted successfully' };
  }

  async getManyNetworkInterfaces(
    internalNetworkId: string,
    query: GetManyNetworkInterfacesQueryDto,
    workspaceId: string,
  ): Promise<GetManyNetworkInterfacesResponseDto> {
    // Verify internal network exists and belongs to workspace
    const internalNetwork = await this.internalNetworkRepository.findOne({
      where: { id: internalNetworkId, workspaceId },
    });
    if (!internalNetwork) {
      throw new NotFoundException('Internal network not found');
    }

    const { page, limit, sortBy, sortOrder, search } = query;
    const skip = (page - 1) * limit;

    const where: { internalNetworkId: string; interfaceName?: FindOperator<string> } = {
      internalNetworkId,
    };
    if (search) {
      where.interfaceName = Like(`%${search}%`);
    }

    const [interfaces, total] = await this.networkInterfaceRepository.findAndCount(
      {
        where,
        order: { [sortBy]: sortOrder },
        skip,
        take: limit,
      },
    );

    const data = interfaces.map((iface) => ({
      id: iface.id,
      interfaceName: iface.interfaceName,
      ipAddress: iface.ipAddress,
      cidr: iface.cidr,
      gatewayIp: iface.gatewayIp,
      gatewayMac: iface.gatewayMac,
      workerId: iface.workerId,
      createdAt: iface.createdAt,
      updatedAt: iface.updatedAt,
    }));

    const pageCount = Math.ceil(total / limit);
    const hasNextPage = page * limit < total;

    return {
      data,
      total,
      page,
      limit,
      hasNextPage,
      pageCount,
    };
  }

  async getInternalNetworkById(
    id: string,
    workspaceId: string,
  ): Promise<GetInternalNetworkResponseDto> {
    const network = await this.internalNetworkRepository.findOne({
      where: { id, workspaceId },
      relations: ['creator'],
    });
    if (!network) {
      throw new NotFoundException('Internal network not found');
    }

    return {
      id: network.id,
      name: network.name,
      createdAt: network.createdAt,
      updatedAt: network.updatedAt,
      createdBy: {
        id: network.creator?.id || '',
        name: network.creator?.name || '',
        image: network.creator?.image || '',
      },
    };
  }
}
