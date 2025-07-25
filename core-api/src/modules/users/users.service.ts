import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from 'src/common/enums/enum';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthService } from './../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    public usersRepository: Repository<User>,
    private authService: AuthService,
  ) {}

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
