import { ViewColumn, ViewEntity } from 'typeorm';

@ViewEntity({
  name: 'workspace_statistics_view',
})
export class WorkspaceStatisticsView {
  @ViewColumn()
  workspace_id: string;

  @ViewColumn()
  total_targets: number;

  @ViewColumn()
  total_assets: number;

  @ViewColumn()
  technologies: string[];

  @ViewColumn()
  cname_records: string[];

  @ViewColumn()
  status_codes: number[];
}
