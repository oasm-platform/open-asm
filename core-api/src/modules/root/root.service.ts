import { Injectable } from '@nestjs/common';

@Injectable()
export class RootService {
  public getHealth(): string {
    return 'OK';
  }
}
