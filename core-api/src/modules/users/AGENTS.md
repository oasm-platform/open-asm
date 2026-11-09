# users module

Small module that seeds the bot user and exposes the `User` repository. The user entity and all account flows belong to `auth` (better-auth). Admin user listing lives in `admin/users`.

## Layout

- `users.service.ts`: `UsersService` with a **public** `usersRepository`. `onModuleInit` creates the bot user (`BOT_ID`, `BOT_NAME` "Cai", `BOT_EMAIL`, `Role.BOT`) when it is missing.
- `users.controller.ts`: `@Controller('users')` with no routes.
- `dto/users.dto.ts`: empty file.

## Public surface

- No HTTP routes. Exports `UsersService`. Not global: `RootModule` imports `UsersModule` and reads `usersService.usersRepository` directly (the `isInit` check).
- The entity is `modules/auth/entities/user.entity.ts`. Other modules register `User` with `TypeOrmModule.forFeature([User])` themselves instead of importing this module.

## Invariants

- The bot user is a system identity for headless agent runs. It has no account row and cannot sign in. `AdminUsersService.getUsers` filters it out.

## Testing

`users.service.spec.ts` only checks that the service is defined. The bot seeding is not tested.
