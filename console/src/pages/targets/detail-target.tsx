import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import TargetStatus from '@/components/ui/target-status';
import { JobStatus, useTargetsControllerGetTargetById } from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import { Bug, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ListAssets } from '../assets/list-assets';
import AssetsDiscovering from './assets-discovering';
import SettingTarget from './setting-target';

export function DetailTarget() {
    const { id } = useParams<{ id: string }>();

    const { searchParams } = new URL(window.location.href);
    const animation = searchParams.get('animation') === 'true';
    const navigate = useNavigate();
    const { data: target, isLoading, error } = useTargetsControllerGetTargetById(
        id || '',
        { query: { enabled: !!id, refetchInterval: 1000 } }
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }


    if (error || !target) {
        return (
            <div className="text-center py-12">
                <h2 className="text-xl font-semibold">Target not found</h2>
                <p className="text-muted-foreground mt-2">
                    The target you're looking for doesn't exist or you don't have permission to view it.
                </p>
                <Button className="mt-4" onClick={() => navigate(-1)}>
                    Go back
                </Button>
            </div>
        );
    }

    return (
        <Page title={target.value} isShowButtonGoBack>
            <div className="flex items-center justify-between">
                <div className='flex gap-3 items-center'>
                    <TargetStatus status={target.status} />
                </div>
                <div className='flex items-center gap-3'>
                    <p className="text-muted-foreground">
                        {dayjs(target.lastDiscoveredAt).fromNow()}
                    </p>
                    <Button
                        onClick={() => navigate(`/vulnerabilities?targetId=${target.id}`)}
                        variant="outline"
                        className="hover:cursor-pointer"
                        title={`Start scan vulnerabilities for target ${target.value}`}
                    >
                        <Bug className="h-4 w-4" />Scan
                    </Button>
                    <SettingTarget target={target} />
                </div>
            </div>
            {animation && (target.status === JobStatus.in_progress || target.status === JobStatus.pending) && (
                <AssetsDiscovering targetId={target.id} />
            )}
            <ListAssets targetId={target.id} refetchInterval={target.status === JobStatus.in_progress ? 1000 : 5000} />
        </Page>
    );
}

export default DetailTarget;