import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useAssetsControllerGetTlsAssets } from "@/services/apis/gen/queries";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";

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
                const now = new Date();
                const daysUntilExpiry = Math.ceil(
                    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                );

                return (
                    <div>
                        <div>{format(expiryDate, "yyyy-MM-dd HH:mm")}</div>
                        <div className="text-sm">
                            {daysUntilExpiry > 0 ? (
                                <Badge variant={daysUntilExpiry <= 30 ? "destructive" : "default"}>
                                    {daysUntilExpiry} days left
                                </Badge>
                            ) : (
                                <Badge variant="destructive">Expired</Badge>
                            )}
                        </div>
                    </div>
                );
            },
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
            accessorKey: "tls_connection",
            header: "Connection",
            cell: ({ row }) => (
                <Badge variant="secondary">{row.getValue("tls_connection") || "N/A"}</Badge>
            ),
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
        <Card>
            <CardHeader>
                <CardTitle>TLS Certificate Expirations</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
                <DataTable
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
