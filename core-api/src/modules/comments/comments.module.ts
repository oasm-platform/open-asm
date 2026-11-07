import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';

/** Comment threads shared by issues and vulnerabilities. */
@Module({
  imports: [TypeOrmModule.forFeature([Comment, Issue, Vulnerability])],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
