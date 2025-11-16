import { BaseEntity } from '@/common/entities/base.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { Asset } from './assets.entity';
import { HttpResponse } from './http-response.entity';

@Entity('asset_services')
@Unique(['assetId', 'port'])
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

    @OneToMany(() => Job, (job) => job.assetService, {
        onDelete: 'CASCADE',
    })
    jobs?: Job[];
}
