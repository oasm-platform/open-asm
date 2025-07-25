import { Injectable } from '@nestjs/common';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { UsersService } from '../users/users.service';
import { CreateFirstAdminDto, GetMetadataDto } from './dto/root.dto';

@Injectable()
export class RootService {
  constructor(private readonly usersService: UsersService) {}

  public getHealth(): string {
    return 'OK';
  }

  /**
   * Creates the first admin user in the system.
   * @param dto The data transfer object containing the email and password for the admin user.
   * @returns A promise that resolves to a default message response dto.
   */
  public async createFirstAdmin(
    dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    const { email, password } = dto;
    await this.usersService.createFirstAdmin(email, password);
    return {
      message: 'Admin user created successfully',
    };
  }

  /**
   * Get system metadata.
   * @returns A promise that resolves to a get metadata dto.
   */
  public async getMetadata(): Promise<GetMetadataDto> {
    const userCount = await this.usersService.count();
    return {
      isInit: userCount > 0,
    };
  }
}
