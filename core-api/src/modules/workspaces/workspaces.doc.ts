import { Doc } from '@/common/doc/doc.decorator';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import type { Workspace } from './entities/workspace.entity';

export function GetManyWorkspaceDoc() {
  Doc({
    summary: 'Retrieves a list of workspaces that the user is a member of.',
    response: {
      serialization: GetManyBaseResponseDto<Workspace>,
    },
  });
}
