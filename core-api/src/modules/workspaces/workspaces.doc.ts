import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/common/dtos/get-many-base.dto';
import { Workspace } from './entities/workspace.entity';

export function GetManyWorkspaceDoc() {
  Doc({
    summary: 'Retrieves a list of workspaces that the user is a member of.',
    response: {
      serialization: GetManyResponseDto<Workspace>,
    },
  });
}
