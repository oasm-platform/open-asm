import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import TargetStatus from '@/components/ui/target-status';
import { useTargetsControllerGetTargetById } from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
        <Page>
            <div className="flex items-center justify-between gap-2">
                <div className='flex gap-3 items-center'>
                    <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight">{target.value}</h1>

                </div>
                <div className='flex items-center gap-3'>
                    <TargetStatus status={target.status} />
                    <p className="text-muted-foreground">
                        {dayjs(target.lastDiscoveredAt).fromNow()}
                    </p>
                    <SettingTarget target={target} />
                </div>
            </div>
            {animation && (target.status === 'in_progress' || target.status === 'pending') && (
                <AssetsDiscovering targetId={target.id} />
            )}
            <ListAssets targetId={target.id} refetchInterval={target.status === 'in_progress' ? 1000 : 5000} />
        </Page>
    );
}

export default DetailTarget;