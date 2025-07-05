import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Statistic from "./Statistic";

export default function Dashboard() {
    return <div className="p-6 grid grid-cols-4 gap-6">
        <Statistic />
        <div className="col-span-4 lg:col-span-1">
            <Card className="h-full">
                <CardHeader>
                    <CardTitle>Jobs Registry</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        (This area will display jobs in progress...)
                    </p>
                </CardContent>
            </Card>
        </div>
    </div>
}
