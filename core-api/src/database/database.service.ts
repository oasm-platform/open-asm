import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AssetGroupWorkflowSubscriber } from '../modules/asset-group/entities/asset-groups-workflows.subscriber';

@Injectable()
export class DatabaseService implements OnModuleInit {
    constructor(private dataSource: DataSource) { }

    onModuleInit() {
        // Register subscribers
        this.dataSource.subscribers.push(new AssetGroupWorkflowSubscriber());
    }
}
