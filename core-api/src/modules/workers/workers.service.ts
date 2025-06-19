import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { WorkerNameId } from 'src/common/enums/enum';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Worker } from './entities/worker.entity';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker) private readonly repo: Repository<Worker>,
    private readonly dataSource: DataSource,
  ) {}
  /**
   * Handles a worker's "alive" signal, which is sent
   * whenever a worker boots up or restarts.
   *
   * @param req The express request.
   * @param res The express response.
   * @param workerId The worker's unique identifier.
   */
  public async alive(req: Request, res: Response, workerNameId: WorkerNameId) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const genId = randomUUID();
    const uniqueWorkerId = `${workerNameId}-${genId}`;

    console.log(`✅ Worker connected: ${uniqueWorkerId}`);

    res.write(`event: registered ${uniqueWorkerId}\n`);
    this.workerJoin(genId, workerNameId);
    req.on('close', () => {
      console.log(`❌ Worker disconnected: ${uniqueWorkerId}`);
      this.workerLeave(genId);
    });

    return;
  }

  /*************  ✨ Windsurf Command ⭐  *************/
  /**
   * Registers a worker in the database by inserting a new record
   * with a unique worker index for the given worker name ID.
   *
   * This function runs within a transaction to ensure that the worker
   * index is generated atomically and without conflicts even with
   * concurrent requests. It attempts to find the smallest available
   * index for the worker name and assigns it to the new worker.
   *
   * @param id - The unique identifier of the worker instance.
   * @param workerNameId - The name ID of the worker type.
   * @returns A promise that resolves to the assigned worker index.
   */

  /*******  e6877d22-7221-48f9-9519-3ec6523aa572  *******/
  private async workerJoin(
    id: string,
    workerNameId: WorkerNameId,
  ): Promise<number> {
    return await this.dataSource.transaction(async (manager) => {
      const result = await manager.query(
        `
        WITH next_index AS (
          SELECT i
          FROM generate_series(
            0,
            COALESCE((SELECT MAX("workerIndex") FROM workers WHERE "workerName" = $1), -1) + 1
          ) AS i
          LEFT JOIN workers w ON w."workerIndex" = i AND w."workerName" = $1
          WHERE w."workerIndex" IS NULL
          ORDER BY i ASC
          LIMIT 1
        )
        INSERT INTO workers (id, "workerName", "workerIndex")
        SELECT $2, $1, i FROM next_index
        RETURNING "workerIndex";
      `,
        [workerNameId, id],
      );

      return result[0]?.workerIndex;
    });
  }

  /**
   * Removes a worker from the repository using its unique identifier.
   *
   * @param id - The unique identifier of the worker instance to be removed.
   * @returns A promise that resolves when the worker is successfully deleted.
   */

  private async workerLeave(id: string) {
    return this.repo.delete(id);
  }
}
