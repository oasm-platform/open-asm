import { BOT_EMAIL, BOT_ID, BOT_NAME } from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    public usersRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    // Check if bot already exists in DB
    const existingBot = await this.usersRepository.findOne({
      where: { id: BOT_ID },
    });

    if (!existingBot) {
      // Create bot user if not exists
      const bot = this.usersRepository.create({
        id: BOT_ID,
        name: BOT_NAME,
        email: BOT_EMAIL,
        role: Role.BOT,
        emailVerified: true,
      });
      await this.usersRepository.save(bot);
    }
  }
}
