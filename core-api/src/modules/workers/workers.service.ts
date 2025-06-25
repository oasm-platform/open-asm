import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Worker } from './entities/worker.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { Interval } from '@nestjs/schedule';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { workers } from './workers';

@Injectable()
export class WorkersService {
  private logger = new Logger('WorkersService');
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

    const workerId = randomUUID();
    const uniqueWorkerId = `${workerName}-${workerId}`;

    this.logger.verbose(`✅ Worker connected: ${uniqueWorkerId}`);

    res.write(
      JSON.stringify({
        workerId,
        workerName,
        command: workers.find((step) => step.id === workerName)?.command,
      }),
    );
    await this.workerJoin(workerId, workerName);
    const interval = setInterval(() => {
      this.repo.update(workerId, {
        lastSeenAt: new Date(),
      });
    }, 5000);
    req.on('close', () => {
      this.logger.warn(`❌ Worker disconnected: ${uniqueWorkerId}`);
      this.workerLeave(workerId);
      clearInterval(interval);
    });

    return;
  }

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
   * Automatically removes any workers that have been offline for at least 1 minute (60 seconds)
   * from the database. This function is intended to be run periodically (e.g. every 1 minute)
   * to clean up stale workers that may have disconnected without properly unregistering.
   *
   */
  @Interval(60000)
  async autoRemoveWorkersOffline() {
    const workers = await this.repo
      .find({
        where: {
          lastSeenAt: LessThan(new Date(Date.now() - 60 * 1000)),
        },
      })
      .then((res) => res.map((worker) => worker.id));

    for (const worker of workers) {
      await this.workerLeave(worker);
    }
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
      .andWhere('jobs.status = :status', { status: JobStatus.IN_PROGRESS })
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
