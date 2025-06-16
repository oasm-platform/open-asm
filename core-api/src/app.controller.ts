import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard, UserSession } from './auth/auth.guard';
import { Optional, Public, Session } from './auth/decorators';
import { UserId } from './auth/user-id.decorator';

@Controller()
@UseGuards(AuthGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  /* 
    Protected route that requires authentication
    The session and userId are automatically injected by the AuthGuard
  */
  @Get('/cats')
  getCats(
    @Session() session: UserSession,
    @UserId() userId: string,
    @Body() body: any,
  ): { message: string } {
    console.log({
      session,
      userId,
      body,
    });

    return { message: this.appService.getCat() };
  }

  /* 
   Public route that does not require authentication
  */
  @Post('/cats')
  @Public()
  sayHello(
    @Session() session: UserSession,
    @UserId() userId: string,
    @Body() body: any,
  ): { message: string } {
    console.log({
      session,
      userId,
      body,
    });

    return { message: this.appService.getCat() };
  }
}
