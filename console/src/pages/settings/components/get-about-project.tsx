import { Card, CardTitle } from '@/components/ui/card';
import { useRootControllerGetLatestVersion } from '@/services/apis/gen/queries';
import { CircleCheckBig, MonitorUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function GetAboutProject() {
  const { data } = useRootControllerGetLatestVersion();
  return (
    <>
      <Card className="p-4">
        {data?.isLatest ? (
          <div className="inline-flex items-center gap-4">
            <CircleCheckBig className="text-green-500" />
            <div className="flex flex-col text-sm text-muted-foreground">
              <p>Platform is up to date</p>
              <p>Version {data?.currentVersion || 'N/A'}</p>
            </div>
          </div>
        ) : (
          <div className="inline-flex items-center gap-4">
            <MonitorUp className="text-orange-500" />
            <div className="flex flex-col text-sm text-muted-foreground">
              <p>
                New version available ({data?.latestVersion || 'N/A'}) (
                {data?.releaseDate})
              </p>
              <p>Version {data?.currentVersion || 'N/A'}</p>
            </div>
          </div>
        )}
      </Card>
      <Link
        target="_blank"
        to="https://github.com/oasm-platform/open-asm/blob/main/LICENSE"
      >
        <Card className="p-4">
          <CardTitle>License</CardTitle>
          <span>GPL-3.0 license</span>
        </Card>
      </Link>
    </>
  );
}
