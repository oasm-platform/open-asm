import type { IssueStatus } from '@/common/enums/enum';

export interface IssueSourceHandler {
    onStatusChange(sourceId: string, status: IssueStatus): Promise<void>;
}
