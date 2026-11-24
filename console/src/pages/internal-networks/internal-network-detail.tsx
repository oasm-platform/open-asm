import Page from '@/components/common/page';
import { NetworkInterfacesTable } from '@/components/internal-networks/network-interfaces-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectWorkerTrigger } from '@/components/ui/connect-worker-trigger';
import {
  useInternalNetworksControllerDeleteInternalNetwork,
  useInternalNetworksControllerGetInternalNetworkById,
} from '@/services/apis/gen/queries';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n-dictionary';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EditInternalNetworkDialog } from './components/edit-internal-network-dialog';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate, useParams } from '@tanstack/react-router';

export default function InternalNetworkDetail() {
  const t = useT();
  const { id } = useParams({ strict: false });
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
        navigate({ to: '/internal-networks' });
      },
    },
  });

  if (networkLoading) {
    return <Page title={t('internalNetworks.detail.title')} permission="network.read">{t('common.loading')}</Page>;
  }

  if (!network) {
    return <Page title={t('internalNetworks.detail.title')} permission="network.read">{t('internalNetworks.detail.notFound')}</Page>;
  }

  return (
    <Page
      title={network.name}
     
      action={
        <div className="flex items-center gap-2">
          <EditInternalNetworkDialog
            internalNetwork={network}
            onSuccess={() => refetch()}
          />
          <ConfirmDialog
            title={t('internalNetworks.delete.title')}
            description={t('internalNetworks.delete.description')}
            onConfirm={() => deleteMutation.mutate({ id: network.id })}
            confirmText={t('common.delete')}
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
            <CardTitle>{t('internalNetworks.detail.info')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t('common.name')}</label>
                <p>{network.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium">{t('internalNetworks.detail.createdBy')}</label>
                <p>{network.createdBy.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium">{t('internalNetworks.detail.createdAt')}</label>
                <p>{format(new Date(network.createdAt), 'PPP')}</p>
              </div>
              <div>
                <label className="text-sm font-medium">{t('internalNetworks.detail.updatedAt')}</label>
                <p>{format(new Date(network.updatedAt), 'PPP')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <ConnectWorkerTrigger networkId={network.id} />

        <NetworkInterfacesTable networkId={network.id} />
      </div>
    </Page>
  );
}
