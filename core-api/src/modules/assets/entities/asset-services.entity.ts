import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Asset } from './assets.entity';
import { HttpResponse } from './http-response.entity';

@Entity('asset_services')
export class AssetService extends BaseEntity {
    @ApiProperty()
    @Column()
    value: string;

    @ApiProperty()
    @Column({ type: 'integer' })
    port: number;

    @ApiProperty()
    @Column({ type: 'varchar' })
    assetId: string;

    @ManyToOne(() => Asset, (asset) => asset.assetServices, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'assetId' })
    asset: Asset;

    @OneToMany(() => HttpResponse, (httpResponse) => httpResponse.assetService, {
        onDelete: 'CASCADE',
    })
    httpResponses?: HttpResponse[];
}
