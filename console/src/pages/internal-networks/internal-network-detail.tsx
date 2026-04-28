import Page from '@/components/common/page';
import { NetworkInterfacesTable } from '@/components/internal-networks/network-interfaces-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectWorker } from '@/components/ui/connect-worker';
import { useInternalNetworksControllerGetInternalNetworkById } from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import { useParams } from 'react-router-dom';

export default function InternalNetworkDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: network, isLoading: networkLoading } =
    useInternalNetworksControllerGetInternalNetworkById(id!);

  if (networkLoading) {
    return <Page title="Internal Network Detail">Loading...</Page>;
  }

  if (!network) {
    return <Page title="Internal Network Detail">Network not found</Page>;
  }

  return (
    <Page title={`Internal network: ${network.name}`}>
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
