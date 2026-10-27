import { Roles } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { Role } from '@/common/enums/enum';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminUsersService } from './admin-users.service';
import { AdminUserDto, GetManyAdminUsersDto } from './dto/admin-users.dto';

/**
 * Platform-wide user accounts. Replaces Better Auth's
 * /api/auth/admin/list-users and /api/auth/admin/get-user, which are disabled.
 */
@ApiTags('Admin')
@Controller('admin/users')
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Doc({
    summary: 'List users',
    description:
      'Lists every user account on the platform, excluding bot identities. `search` matches name or email.',
    response: {
      serialization: GetManyResponseDto(AdminUserDto),
    },
  })
  @Get()
  getUsers(@Query() query: GetManyAdminUsersDto) {
    return this.adminUsersService.getUsers(query);
  }

  @Doc({
    summary: 'Get user by ID',
    description: 'Returns a single user account.',
    response: {
      serialization: AdminUserDto,
    },
  })
  @Get(':id')
  getUser(@Param() { id }: IdQueryParamDto) {
    return this.adminUsersService.getUser(id);
  }
}
