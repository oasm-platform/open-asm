import { Role } from '@/common/enums/enum';
import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthService } from './../auth/auth.service';
import { BOT_ID, BOT_USER_DATA } from '@/common/constants/app.constants';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    public usersRepository: Repository<User>,
    private authService: AuthService,
  ) {}

  async onModuleInit() {
    // Check if bot already exists in DB
    const existingBot = await this.usersRepository.findOne({
      where: { id: BOT_ID },
    });

    if (!existingBot) {
      // Create bot user if not exists
      const bot = this.usersRepository.create(BOT_USER_DATA);

      await this.usersRepository.save(bot);
    }
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
