import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from 'src/common/enums/enum';
import { generateToken } from 'src/utils/genToken';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthService } from './../auth/auth.service';
import { GetApiKeyResponseDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private authService: AuthService,
  ) {}

  /**
   * Gets the API key for a user.
   * @param userId The ID of the user to get the API key for.
   * @returns The API key for the user.
   */
  public async getApiKey(userId: string): Promise<GetApiKeyResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.apiKey) {
      user.apiKey = generateToken(48);
      await this.usersRepository.save(user);
    }
    return {
      apiKey: user.apiKey!,
    };
  }

  /**
   * Regenerates the API key for a user.
   * @param userId The ID of the user to regenerate the API key for.
   * @returns The new API key for the user.
   */
  public async regenerateApiKey(userId: string): Promise<GetApiKeyResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.apiKey = generateToken(48);
    await this.usersRepository.save(user);
    return {
      apiKey: user.apiKey!,
    };
  }

  /**
   * Creates the first admin user in the system.
   * @param email The email address to use for the admin user.
   * @param password The password to use for the admin user.
   * @returns The newly created user object.
   */
  public async createFirstAdmin(email: string, password: string) {
    if ((await this.usersRepository.count()) > 0) {
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

    return this.authService.api.signInEmail({
      body: {
        email,
        password,
      },
    });
  }
}
