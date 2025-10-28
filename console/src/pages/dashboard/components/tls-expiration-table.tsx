import { TlsDateBadge } from "@/components/tls-date-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useAssetsControllerGetTlsAssets } from "@/services/apis/gen/queries";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { useNavigate } from 'react-router-dom';

interface TlsAsset {
    host: string;
    sni: string;
    subject_dn: string;
    subject_an: string[];
    not_after: string;
    not_before: string;
    tls_connection: string;
}

const TlsExpirationTable = () => {
    const navigate = useNavigate()
    const { data, isLoading, error } = useAssetsControllerGetTlsAssets();

    const columns: ColumnDef<TlsAsset>[] = [
        {
            accessorKey: "host",
            header: "Host",
            cell: ({ row }) => (
                <div className="font-medium">{row.getValue("host") || "N/A"}</div>
            ),
        },
        {
            accessorKey: "not_before",
            header: "Valid From",
            cell: ({ row }) => {
                const notBefore = row.getValue("not_before") as string;
                if (!notBefore) {
                    return <div>N/A</div>;
                }
                const startDate = new Date(notBefore);
                if (isNaN(startDate.getTime())) {
                    return <div>Invalid Date</div>;
                }
                return <div>{format(startDate, "yyyy-MM-dd")}</div>;
            },
        },
        {
            accessorKey: "not_after",
            header: "Expires",
            cell: ({ row }) => {
                const notAfter = row.getValue("not_after") as string;
                if (!notAfter) {
                    return <div>N/A</div>;
                }
                const expiryDate = new Date(notAfter);
                if (isNaN(expiryDate.getTime())) {
                    return <div>Invalid Date</div>;
                }

                return <div className='h-8 flex items-center'>
                    <TlsDateBadge date={notAfter} />
                </div>;
            },
        },
    ];

    const tlsAssets = data?.data || [];

    // Filter to show only certificates that are expiring soon (within 90 days) or already expired
    const expiringSoon = tlsAssets.filter(asset => {
        const expiryDate = new Date(asset.not_after);
        const now = new Date();
        const daysUntilExpiry = Math.ceil(
            (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysUntilExpiry <= 90; // Show certificates expiring within 90 days or already expired
    });

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>TLS Certificate Expirations</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                    <div className="text-red-600">Error loading TLS certificates</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="py-3 pt-6">
            <CardHeader>
                <CardTitle>TLS certificate expirations</CardTitle>
            </CardHeader>
            <CardContent className="p-4 py-0">
                <DataTable
                    onRowClick={(row) => navigate(`/assets?filter=${row.host}`)}
                    isShowBorder={false}
                    columns={columns}
                    data={expiringSoon}
                    isLoading={isLoading}
                    page={1}
                    pageSize={expiringSoon.length}
                    totalItems={expiringSoon.length}
                    showPagination={false}
                    isShowHeader={true}
                />
            </CardContent>
        </Card>
    );
};

export default TlsExpirationTable;
