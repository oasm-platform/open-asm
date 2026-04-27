import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOperator, Like, Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateInternalNetworkDto } from './dtos/create-internal-network.dto';
import {
  GetManyInternalNetworksQueryDto,
  GetManyInternalNetworksResponseDto,
} from './dtos/get-many-internal-networks.dto';
import { UpdateInternalNetworkDto } from './dtos/update-internal-network.dto';
import { InternalNetwork } from './entities/internal-network.entity';

@Injectable()
export class InternalNetworksService {
  constructor(
    @InjectRepository(InternalNetwork)
    private readonly internalNetworkRepository: Repository<InternalNetwork>,
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
}
