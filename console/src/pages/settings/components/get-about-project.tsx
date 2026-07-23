import { Card, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Markdown } from '@/components/common/markdown';
import { useRootControllerGetLatestVersion } from '@/services/apis/gen/queries';
import { cn } from '@/lib/utils';
import { CircleCheckBig, ChevronDown, MonitorUp } from 'lucide-react';
import { useState } from 'react';

export default function GetAboutProject() {
  const { data } = useRootControllerGetLatestVersion();
  const [notesOpen, setNotesOpen] = useState(false);

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

      {data?.notes && (
        <Card className="p-4">
          <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between text-left">
                <CardTitle>Release Note</CardTitle>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform duration-200',
                    notesOpen && 'rotate-180',
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <Markdown content={data.notes} />
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      <a
        target="_blank"
        href="https://github.com/oasm-platform/open-asm/blob/main/LICENSE"
      >
        <Card className="p-4">
          <CardTitle>License</CardTitle>
          <span>GPL-3.0 license</span>
        </Card>
      </a>
    </>
  );
}
