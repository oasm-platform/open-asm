import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  public healthCheck() {
    return 'OK';
  }
}
