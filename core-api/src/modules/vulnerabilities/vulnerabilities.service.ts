import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vulnerability } from './entities/vulnerability.entity';

@Injectable()
export class VulnerabilitiesService {
  constructor(
    @InjectRepository(Vulnerability)
    private vulnerabilitiesRepository: Repository<Vulnerability>,
  ) {}
}
