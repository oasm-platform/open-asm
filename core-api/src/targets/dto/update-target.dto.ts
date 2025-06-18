import { PartialType } from '@nestjs/swagger';
import { CreateTargetDto } from './create-target.dto';

export class UpdateTargetDto extends PartialType(CreateTargetDto) {}
