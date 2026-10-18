import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import { buildBugReportUrl, type BugReport } from '@/utils/bug-report-url';

/**
 * Prefilled GitHub bug report link for this instance's repo, with the running
 * version and the viewer's browser. Undefined until metadata has loaded.
 */
export function useBugReportUrl(report?: BugReport): string | undefined {
  const { data: metadata } = useRootControllerGetMetadata();
  if (!metadata?.gitRepoUrl) return undefined;

  return buildBugReportUrl(metadata.gitRepoUrl, {
    ...report,
    version:
      typeof metadata.currentVersion === 'string'
        ? metadata.currentVersion
        : null,
  });
}
