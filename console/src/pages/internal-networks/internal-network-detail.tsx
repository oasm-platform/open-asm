import Page from '@/components/common/page';
import { NetworkInterfacesTable } from '@/components/internal-networks/network-interfaces-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectWorker } from '@/components/ui/connect-worker';
import {
  useInternalNetworksControllerDeleteInternalNetwork,
  useInternalNetworksControllerGetInternalNetworkById,
} from '@/services/apis/gen/queries';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EditInternalNetworkDialog } from './components/edit-internal-network-dialog';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';

export default function InternalNetworkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: network, isLoading: networkLoading, refetch } =
    useInternalNetworksControllerGetInternalNetworkById(id!, {
      query: {
        queryKey: ['internalNetwork', id],
      },
    });

  const deleteMutation = useInternalNetworksControllerDeleteInternalNetwork({
    mutation: {
      onSuccess: () => {
        navigate('/internal-networks');
      },
    },
  });

  if (networkLoading) {
    return <Page title="Internal Network Detail">Loading...</Page>;
  }

  if (!network) {
    return <Page title="Internal Network Detail">Network not found</Page>;
  }

  return (
    <Page
      title={network.name}
      isShowButtonGoBack
      action={
        <div className="flex items-center gap-2">
          <EditInternalNetworkDialog
            internalNetwork={network}
            onSuccess={() => refetch()}
          />
          <ConfirmDialog
            title="Delete Internal Network"
            description={`All targets and assets associated with this network will be permanently deleted. This action cannot be undone.`}
            onConfirm={() => deleteMutation.mutate({ id: network.id })}
            confirmText="Delete"
            typeToConfirm={network.name}
            trigger={
              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-800">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Network Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <p>{network.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Created By</label>
                <p>{network.createdBy.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Created At</label>
                <p>{format(new Date(network.createdAt), 'PPP')}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Updated At</label>
                <p>{format(new Date(network.updatedAt), 'PPP')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <ConnectWorker networkId={network.id} />

        <NetworkInterfacesTable networkId={network.id} />
      </div>
    </Page>
  );
}
