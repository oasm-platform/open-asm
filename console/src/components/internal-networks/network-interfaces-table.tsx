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
  useInternalNetworksControllerGetManyNetworkInterfaces,
  type GetManyNetworkInterfacesResponseDtoDataItem,
} from '@/services/apis/gen/queries';
import { format } from 'date-fns';

interface NetworkInterfacesTableProps {
  networkId: string;
}

export function NetworkInterfacesTable({
  networkId,
}: NetworkInterfacesTableProps) {
  const { data } = useInternalNetworksControllerGetManyNetworkInterfaces(
    networkId,
    {
      limit: 50,
      page: 1,
    },
  );
  return (
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
            {data?.data.map(
              (iface: GetManyNetworkInterfacesResponseDtoDataItem) => (
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
              ),
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
