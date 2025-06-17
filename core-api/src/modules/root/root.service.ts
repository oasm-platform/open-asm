import { Injectable } from '@nestjs/common';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { UsersService } from '../users/users.service';
import { CreateFirstAdminDto } from './dto/root.dto';

@Injectable()
export class RootService {
  constructor(private readonly userService: UsersService) {}
  public getHealth(): string {
    return 'OK';
  }

  public async createFirstAdmin(
    dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    const { email, password } = dto;
    await this.userService.createFirstAdmin(email, password);
    return {
      message: 'Admin user created successfully',
    };
  }
}
