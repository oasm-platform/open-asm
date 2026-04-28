import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useInternalNetworksControllerGetInternalNetworkById,
  useInternalNetworksControllerGetManyNetworkInterfaces,
} from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import { useParams } from 'react-router-dom';

export default function InternalNetworkDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: network, isLoading: networkLoading } =
    useInternalNetworksControllerGetInternalNetworkById(id!);
  const { data: interfaces, isLoading: interfacesLoading } =
    useInternalNetworksControllerGetManyNetworkInterfaces(id, {
      limit: 50,
      page: 1,
    });

  if (networkLoading || interfacesLoading) {
    return <Page title="Internal Network Detail">Loading...</Page>;
  }

  if (!network) {
    return <Page title="Internal Network Detail">Network not found</Page>;
  }

  return (
    <Page title={`Internal Network: ${network.name}`}>
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

        <Card>
          <CardHeader>
            <CardTitle>Network Interfaces</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interface Name</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>CIDR</TableHead>
                  <TableHead>Gateway IP</TableHead>
                  <TableHead>Gateway MAC</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interfaces?.data.map((iface) => (
                  <TableRow key={iface.id}>
                    <TableCell>{iface.interfaceName}</TableCell>
                    <TableCell>{iface.ipAddress}</TableCell>
                    <TableCell>{iface.cidr}</TableCell>
                    <TableCell>{iface.gatewayIp}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{iface.gatewayMac}</Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(iface.createdAt), 'PP')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
