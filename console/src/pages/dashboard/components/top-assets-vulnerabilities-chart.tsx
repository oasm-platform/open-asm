import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"
import { useStatisticControllerGetTopAssetsWithMostVulnerabilities } from '@/services/apis/gen/queries'
import { useNavigate } from 'react-router-dom'

export const description = "A bar chart with a custom label"

const chartConfig = {
    critical: {
        label: "Critical",
        color: "#dc2626",
    },
    high: {
        label: "High",
        color: "#ef4444",
    },
    medium: {
        label: "Medium",
        color: "#f97316",
    },
    low: {
        label: "Low",
        color: "#eab308",
    },
    info: {
        label: "Info",
        color: "#6b7280",
    },
    label: {
        color: "var(--background)",
    },
} satisfies ChartConfig

export default function ChartBarLabelCustom() {
    const navigate = useNavigate()
    const { data: apiData, isLoading, error } = useStatisticControllerGetTopAssetsWithMostVulnerabilities()

    const chartData = apiData?.filter((item) => item.total !== 0).map((item) => ({
        asset: item.value,
        critical: item.critical,
        high: item.high,
        medium: item.medium,
        low: item.low,
        info: item.info,
        total: item.total,
    })) || []

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Top Assets with Most Vulnerabilities</CardTitle>
                    <CardDescription>Loading...</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-8">
                        Loading...
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Top Assets with Most Vulnerabilities</CardTitle>
                    <CardDescription>Error loading data</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-8">
                        Error loading data
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Top Assets with Most Vulnerabilities</CardTitle>
                <CardDescription>Assets with the highest number of vulnerabilities</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig}>
                    <BarChart
                        accessibilityLayer
                        data={chartData}
                        layout="vertical"
                        margin={{
                            right: 16,
                        }}
                        barGap={2}
                        onClick={(data) => {
                            if (data && data.activePayload && data.activePayload[0]) {
                                const assetId = data.activePayload[0].payload.id
                                if (assetId) {
                                    navigate(`/assets/${assetId}`)
                                }
                            }
                        }}
                    >
                        <CartesianGrid horizontal={false} />
                        <YAxis
                            dataKey="asset"
                            type="category"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            tickFormatter={(value) => value.slice(0, 20) + (value.length > 20 ? '...' : '')}
                            hide
                        />
                        <XAxis dataKey="total" type="number" hide />
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="line" />}
                        />
                        <Bar
                            dataKey="critical"
                            layout="vertical"
                            fill="var(--color-critical)"
                            radius={8}
                            stackId="a"
                        />
                        <Bar
                            dataKey="high"
                            layout="vertical"
                            fill="var(--color-high)"
                            radius={8}
                            stackId="a"
                        />
                        <Bar
                            dataKey="medium"
                            layout="vertical"
                            fill="var(--color-medium)"
                            radius={8}
                            stackId="a"
                        />
                        <Bar
                            dataKey="low"
                            layout="vertical"
                            fill="var(--color-low)"
                            radius={8}
                            stackId="a"
                        />
                        <Bar
                            dataKey="info"
                            layout="vertical"
                            fill="var(--color-info)"
                            radius={8}
                            stackId="a"
                        >
                            <LabelList
                                dataKey="asset"
                                position="insideLeft"
                                offset={8}
                                className="fill-white"
                                fontSize={12}
                            />
                            <LabelList
                                dataKey="total"
                                position="right"
                                offset={8}
                                className="fill-foreground"
                                fontSize={12}
                            />
                        </Bar>
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}
