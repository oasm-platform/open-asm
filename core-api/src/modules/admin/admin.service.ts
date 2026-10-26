import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import { AuthService } from '@/modules/auth/auth.service';
import { User } from '@/modules/auth/entities/user.entity';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFirstAdminDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly authService: AuthService,
  ) {}

  /**
   * Creates the first admin user in the system.
   * Refused once any admin exists, so it only works on a fresh install.
   * @param dto The email and password for the admin user.
   * @returns A default message response dto.
   */
  public async createFirstAdmin(
    dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    const { email, password } = dto;
    if (
      (await this.usersRepository.count({
        where: { role: Role.ADMIN },
      })) > 0
    ) {
      throw new ForbiddenException();
    }

    const result = await this.authService.api.signUpEmail({
      body: {
        name: 'Admin',
        email,
        password,
      },
    });

    await this.usersRepository.update(result.user.id, {
      role: Role.ADMIN,
      emailVerified: true,
    });

    await this.authService.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    return {
      message: 'Admin user created successfully',
    };
  }
}
