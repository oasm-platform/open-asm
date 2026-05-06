import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { TargetsService } from '../targets/targets.service';
import { CreateInternalNetworkDto } from './dtos/create-internal-network.dto';
import { CreateTargetsFromInterfacesDto } from './dtos/create-targets-from-interfaces.dto';
import {
  GetInternalNetworkResponseDto,
  GetManyInternalNetworksQueryDto,
  GetManyInternalNetworksResponseDto,
} from './dtos/get-many-internal-networks.dto';
import { Target, TargetType } from '../targets/entities/target.entity';
import {
  GetManyNetworkInterfacesQueryDto,
  GetManyNetworkInterfacesResponseDto,
} from './dtos/get-many-network-interfaces.dto';
import { UpdateInternalNetworkDto } from './dtos/update-internal-network.dto';
import { InternalNetwork } from './entities/internal-network.entity';
import { NetworkInterface } from './entities/network-interface.entity';
import { WorkerInstance } from '../workers/entities/worker.entity';

@Injectable()
export class InternalNetworksService {
  constructor(
    @InjectRepository(InternalNetwork)
    private readonly internalNetworkRepository: Repository<InternalNetwork>,
    @InjectRepository(NetworkInterface)
    private readonly networkInterfaceRepository: Repository<NetworkInterface>,
    private readonly workspacesService: WorkspacesService,
    private readonly targetsService: TargetsService,
  ) {}

  async getManyInternalNetworks(
    query: GetManyInternalNetworksQueryDto,
    workspaceId: string,
  ): Promise<GetManyInternalNetworksResponseDto> {
    const { page, limit, sortBy, sortOrder, search } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.internalNetworkRepository
      .createQueryBuilder('network')
      .leftJoinAndSelect('network.creator', 'creator')
      .addSelect(
        (subQuery) => {
          return subQuery
            .select('COUNT(worker.id)', 'agentCount')
            .from(WorkerInstance, 'worker')
            .where('worker.internalNetworkId = network.id');
        },
        'agents',
      )
      .where('network.workspaceId = :workspaceId', { workspaceId });

    if (search) {
      queryBuilder.andWhere('network.name LIKE :search', {
        search: `%${search}%`,
      });
    }

    queryBuilder.orderBy(`network.${sortBy}`, sortOrder).skip(skip).take(limit);

    const { entities, raw } = await queryBuilder.getRawAndEntities();
    const total = await queryBuilder.getCount();

    const data = entities.map((network, index) => {
      const rawData = raw[index] as { agents: string | number };
      return {
        id: network.id,
        name: network.name,
        createdAt: network.createdAt,
        updatedAt: network.updatedAt,
        agents: parseInt(String(rawData.agents), 10) || 0,
        createdBy: {
          id: network.creator?.id || '',
          name: network.creator?.name || '',
          image: network.creator?.image || '',
        },
      };
    });

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

    const queryBuilder = this.networkInterfaceRepository
      .createQueryBuilder('iface')
      .leftJoin(
        Target,
        'target',
        'target.value = iface.cidr AND target.internalNetworkId = :internalNetworkId',
        {
          internalNetworkId,
        },
      )
      .where('iface.internalNetworkId = :internalNetworkId', {
        internalNetworkId,
      })
      .select('iface.id', 'id')
      .addSelect('iface.interfaceName', 'interfaceName')
      .addSelect('iface.ipAddress', 'ipAddress')
      .addSelect('iface.cidr', 'cidr')
      .addSelect('iface.gatewayIp', 'gatewayIp')
      .addSelect('iface.gatewayMac', 'gatewayMac')
      .addSelect('iface.workerId', 'workerId')
      .addSelect('iface.createdAt', 'createdAt')
      .addSelect('iface.updatedAt', 'updatedAt')
      .addSelect('target.id', 'targetId');

    if (search) {
      queryBuilder.andWhere('iface.interfaceName LIKE :search', {
        search: `%${search}%`,
      });
    }

    queryBuilder.orderBy(`iface.${sortBy}`, sortOrder);
    queryBuilder.skip(skip).take(limit);

    const [rawResults, total] = await Promise.all([
      queryBuilder.getRawMany(),
      queryBuilder.getCount(),
    ]);

    interface RawNetworkInterface {
      id: string;
      interfaceName: string;
      ipAddress: string;
      cidr: string;
      gatewayIp: string;
      gatewayMac: string;
      workerId: string;
      createdAt: Date;
      updatedAt: Date;
      targetId: string | null;
    }

    const data = (rawResults as RawNetworkInterface[]).map((row) => ({
      id: row.id,
      interfaceName: row.interfaceName,
      ipAddress: row.ipAddress,
      cidr: row.cidr,
      gatewayIp: row.gatewayIp,
      gatewayMac: row.gatewayMac,
      workerId: row.workerId,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      targetId: row.targetId || null,
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
      relations: ['creator', 'workers'],
    });
    if (!network) {
      throw new NotFoundException('Internal network not found');
    }

    return {
      id: network.id,
      name: network.name,
      createdAt: network.createdAt,
      updatedAt: network.updatedAt,
      agents: network.workers?.length || 0,
      createdBy: {
        id: network.creator?.id || '',
        name: network.creator?.name || '',
        image: network.creator?.image || '',
      },
    };
  }

  async createTargetsFromInterfaces(
    dto: CreateTargetsFromInterfacesDto,
    user: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    const interfaces = await this.networkInterfaceRepository.findByIds(
      dto.networkInterfaceIds,
    );

    if (interfaces.length === 0) {
      throw new NotFoundException('No network interfaces found');
    }

    const networkIds = [...new Set(interfaces.map((i) => i.internalNetworkId))];
    const networks = await this.internalNetworkRepository.findByIds(networkIds);

    if (networks.length !== networkIds.length) {
      throw new NotFoundException('One or more internal networks not found');
    }

    const networkMap = new Map(networks.map((n) => [n.id, n]));
    const workspaceIds = new Set(networks.map((n) => n.workspaceId));

    for (const workspaceId of workspaceIds) {
      await this.workspacesService.getWorkspaceByIdAndOwner(workspaceId, user);
    }

    const grouped = new Map<string, Map<string, string[]>>();
    for (const iface of interfaces) {
      const network = networkMap.get(iface.internalNetworkId);
      const workspaceId = network!.workspaceId;
      const internalNetworkId = iface.internalNetworkId;

      if (!grouped.has(workspaceId)) {
        grouped.set(workspaceId, new Map());
      }
      const networksInWorkspace = grouped.get(workspaceId)!;
      if (!networksInWorkspace.has(internalNetworkId)) {
        networksInWorkspace.set(internalNetworkId, []);
      }
      networksInWorkspace.get(internalNetworkId)!.push(iface.cidr);
    }

    for (const [workspaceId, networksInWorkspace] of grouped) {
      for (const [internalNetworkId, cidrs] of networksInWorkspace) {
        await this.targetsService.createMultipleTargets(
          {
            targets: cidrs.map((cidr) => ({
              value: cidr,
              type: TargetType.CIDR,
            })),
          },
          workspaceId,
          user,
          internalNetworkId,
        );
      }
    }

    return { message: 'Targets created successfully from network interfaces' };
  }
}
