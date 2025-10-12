import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { CreateFirstAdminDto, GetMetadataDto } from './dto/root.dto';

@Injectable()
export class RootService {
  constructor(private readonly usersService: UsersService) { }

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
    const MILLISECONDS_PER_SECOND = 100;
    const SECONDS_PER_MINUTE = 60;
    const MINUTES_PER_HOUR = 60;
    const HOURS_PER_DAY = 24;
    const DAYS_PER_YEAR = 365;

    const userCount = await this.usersService.usersRepository.count({
      cache: {
        id: 'isInit',
        milliseconds:
          MILLISECONDS_PER_SECOND *
          SECONDS_PER_MINUTE *
          MINUTES_PER_HOUR *
          HOURS_PER_DAY *
          DAYS_PER_YEAR,
      },
    });
    return {
      isInit: userCount > 0,
    };
  }
}
