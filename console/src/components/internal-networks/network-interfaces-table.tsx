import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useInternalNetworksControllerCreateTargetsFromInterfaces,
  useInternalNetworksControllerGetManyNetworkInterfaces,
  type GetManyNetworkInterfacesResponseDtoDataItem,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';

interface NetworkInterfaceItem extends GetManyNetworkInterfacesResponseDtoDataItem {
  id: string;
  targetId?: string;
  interfaceName: string;
  ipAddress: string;
  cidr: string;
  gatewayIp: string;
  gatewayMac: string;
  createdAt: string;
}

interface NetworkInterfacesTableProps {
  networkId: string;
}

export function NetworkInterfacesTable({
  networkId,
}: NetworkInterfacesTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useInternalNetworksControllerGetManyNetworkInterfaces(
    networkId,
    {
      limit: 50,
      page: 1,
    },
  );

  const { mutate: createTargets, isPending } =
    useInternalNetworksControllerCreateTargetsFromInterfaces({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ['/api/internal-networks'],
        });
      },
    });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (data?.data) {
      const initialSelected = data.data
        .filter((iface) => (iface as NetworkInterfaceItem).targetId)
        .map((iface) => (iface as NetworkInterfaceItem).id);
      setSelectedIds(initialSelected);
    }
  }, [data]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (!data?.data) return;
    const allEnabledIds = data.data
      .filter((iface) => !(iface as NetworkInterfaceItem).targetId)
      .map((iface) => (iface as NetworkInterfaceItem).id);

    const allSelected = allEnabledIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !allEnabledIds.includes(id)),
      );
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...allEnabledIds])]);
    }
  };

  const handleStartDiscovery = () => {
    const idsToCreate = selectedIds.filter((id) => {
      const iface = data?.data.find(
        (i) => (i as NetworkInterfaceItem).id === id,
      );
      return iface && !(iface as NetworkInterfaceItem).targetId;
    });

    if (idsToCreate.length === 0) return;
    console.log(idsToCreate);
    createTargets({
      data: {
        networkInterfaceIds: idsToCreate,
      },
    });
  };

  const hasSelectableItems = selectedIds.some((id) => {
    const iface = data?.data.find((i) => (i as NetworkInterfaceItem).id === id);
    return iface && !(iface as NetworkInterfaceItem).targetId;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Network Interfaces</CardTitle>
        {hasSelectableItems && (
          <Button onClick={handleStartDiscovery} disabled={isPending} size="sm">
            {isPending ? 'Starting...' : 'Start Discovery'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  onCheckedChange={toggleAll}
                  checked={
                    data?.data?.length > 0 &&
                    data.data.every((iface) =>
                      selectedIds.includes((iface as NetworkInterfaceItem).id),
                    )
                  }
                />
              </TableHead>
              <TableHead>Interface Name</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>CIDR</TableHead>
              <TableHead>Gateway IP</TableHead>
              <TableHead>Gateway MAC</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((iface) => {
              const item = iface as NetworkInterfaceItem;
              const isDisabled = !!item.targetId;
              return (
                <TableRow 
                  key={item.id} 
                  className={item.targetId ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => item.targetId && navigate(`/targets/${item.targetId}`)}
                >
                  <TableCell>
                    <Checkbox
                      disabled={isDisabled}
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => toggleSelection(item.id)}
                    />
                  </TableCell>
                  <TableCell>{item.interfaceName}</TableCell>
                  <TableCell>{item.ipAddress}</TableCell>
                  <TableCell>{item.cidr}</TableCell>
                  <TableCell>{item.gatewayIp}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.gatewayMac}</Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(item.createdAt), 'PP')}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
