import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { useTargetsControllerGetTargetById } from '@/services/apis/gen/queries';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ListAssets } from '../assets/list-assets';

export function DetailTarget() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: target, isLoading, error } = useTargetsControllerGetTargetById(
        id || '',
        { query: { enabled: !!id } }
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
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{target.value}</h1>
                    <p className="text-muted-foreground">
                        Last scanned: {new Date(target.lastDiscoveredAt).toLocaleString()}
                    </p>
                </div>
            </div>
            <ListAssets targetId={target.id} />
        </Page>
    );
}

export default DetailTarget;