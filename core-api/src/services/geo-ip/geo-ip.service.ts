import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProperty } from '@nestjs/swagger';
import { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

export class GeoIp {
    @ApiProperty()
    query: string;
    @ApiProperty()
    status: string;
    @ApiProperty()
    continent: string;
    @ApiProperty()
    continentCode: string;
    @ApiProperty()
    country: string;
    @ApiProperty()
    countryCode: string;
    @ApiProperty()
    region: string;
    @ApiProperty()
    regionName: string;
    @ApiProperty()
    city: string;
    @ApiProperty()
    district: string;
    @ApiProperty()
    zip: string;
    @ApiProperty()
    lat: number;
    @ApiProperty()
    lon: number;
    @ApiProperty()
    timezone: string;
    @ApiProperty()
    offset: number;
    @ApiProperty()
    currency: string;
    @ApiProperty()
    isp: string;
    @ApiProperty()
    org: string;
    @ApiProperty()
    as: string;
    @ApiProperty()
    asname: string;
}

@Injectable()
export class GeoIpService {
    private readonly logger = new Logger(GeoIpService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {
        const geoIpUrl = this.configService.get<string>('GEO_IP_URL');
        if (!geoIpUrl) {
            throw new Error('GEO_IP_URL configuration is missing');
        }
        this.httpService.axiosRef.defaults.baseURL = `http://${geoIpUrl}`;

        // Test connection to base URL
        void this.testConnection();
    }

    private async testConnection(): Promise<void> {
        try {
            // Make a simple request to test the connection
            await firstValueFrom(
                this.httpService.get('/'),
            );
            this.logger.log('Geo IP service connection established successfully');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to connect to Geo IP service: ${errorMessage}`);
            throw new Error(`Geo IP service connection failed: ${errorMessage}`);
        }
    }

    /**
     * Fetches geolocation data for the provided IP addresses
     * @param ips Array of IP addresses to look up
     * @returns Array of geolocation data for the provided IPs
     */
    async getGeoIp(ips: string[]): Promise<GeoIp[]> {
        try {
            const response: AxiosResponse<GeoIp[]> = await firstValueFrom(
                this.httpService.get<GeoIp[]>(`/bulk/${ips.join(',')}`),
            );

            return response.data;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error fetching geo IP data: ${errorMessage}`, error);
            throw new BadRequestException(`Failed to fetch geo IP data: ${errorMessage}`);
        }
    }
}