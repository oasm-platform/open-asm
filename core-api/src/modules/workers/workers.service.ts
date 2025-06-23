import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Worker } from './entities/worker.entity';
import { Job } from '../jobs-registry/entities/job.entity';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker) public readonly repo: Repository<Worker>,
    @InjectRepository(Job) private readonly jobRepo: Repository<Job>,
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
  public async alive(req: Request, res: Response, workerName: WorkerName) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const genId = randomUUID();
    const uniqueWorkerId = `${workerName}-${genId}`;

    console.log(`✅ Worker connected: ${uniqueWorkerId}`);

    res.write(`event: registered ${uniqueWorkerId}\n`);
    this.workerJoin(genId, workerName);
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
    workerName: WorkerName,
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
        [workerName, id],
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
    await this.jobRepo
      .createQueryBuilder('jobs')
      .update()
      .set({ status: JobStatus.PENDING, workerId: null as any })
      .where('jobs."workerId" = :id', { id })
      .execute();
    return this.repo.delete(id);
  }

  /**
   * Retrieves a worker by its unique identifier.
   *
   * @param id - The unique identifier of the worker to retrieve.
   * @returns A promise that resolves to the worker if found, otherwise null.
   * @throws NotFoundException if the worker is not found.
   */
  public async getWorkerById(id: string): Promise<Worker | null> {
    const worker = await this.repo.findOne({
      where: { id },
    });

    if (!worker) {
      throw new NotFoundException(`Worker with ID ${id} not found`);
    }

    return worker;
  }
}
