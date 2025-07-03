import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { ResultHandler, Worker } from 'src/common/interfaces/app.interface';
import { generateToken } from 'src/utils/genToken';
import { getManyResponse } from 'src/utils/getManyResponse';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { WorkerAliveDto, WorkerJoinDto } from './dto/workers.dto';
import { WorkerInstance } from './entities/worker.entity';

@Injectable()
export class WorkersService {
  private logger = new Logger('WorkersService');
  constructor(
    @InjectRepository(WorkerInstance)
    public readonly repo: Repository<WorkerInstance>,

    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,

    private readonly dataSource: DataSource,

    @Inject(forwardRef(() => JobsRegistryService))
    private jobsRegistryService: JobsRegistryService,

    private configService: ConfigService,
  ) {}

  public workers: Worker[] = [
    {
      id: WorkerName.SUBDOMAINS,
      description: 'Fast passive subdomain enumeration tool.',
      command:
        '(echo {{value}} && subfinder -d {{value}}) | dnsx -a -aaaa -cname -mx -ns -soa -txt -resp',
      resultHandler: async ({ result, job, dataSource }: ResultHandler) => {
        const parsed = {};
        result.split('\n').forEach((line) => {
          const cleaned = line.replace(/\x1B\[[0-9;]*m/g, '').trim();

          const match = cleaned.match(/^([^\[]+)\s+\[([A-Z]+)\]\s+\[(.+)\]$/);
          if (!match) return;

          const [, domain, type, value] = match;

          if (!parsed[domain]) parsed[domain] = {};
          if (!parsed[domain][type]) parsed[domain][type] = [];

          parsed[domain][type].push(value);
        });

        const primaryAsset = parsed[job.asset.value];

        delete parsed[job.asset.value];
        this.updateResultToDatabase(dataSource, job, {
          total: Object.keys(parsed).length,
        });
        const assets: Asset[] = Object.keys(parsed).map((i) => ({
          id: randomUUID(),
          value: i,
          target: { id: job.asset.target.id },
          dnsRecords: parsed[i],
        })) as Asset[];
        // Fill to the asset table
        await this.assetRepo
          .createQueryBuilder()
          .insert()
          .values(assets)
          .orIgnore()
          .execute();

        await this.assetRepo.update(job.asset.id, {
          dnsRecords: primaryAsset,
        });

        assets.push(job.asset);

        await this.jobsRegistryService.startNextJob(assets, job.workerName);
      },
    },
    {
      id: WorkerName.PORTS,
      description: 'Scan open ports and detect running services on each port.',
      command: 'naabu -host {{value}} -silent',
      resultHandler: async ({ result, job, dataSource }: ResultHandler) => {
        const parsed = result
          .trim()
          .split('\n')
          .filter((i) => i.includes(':'))
          .map((i) => Number(i.split(':')[1].replace('\r', '')))
          .sort();
        this.updateResultToDatabase(dataSource, job, parsed);
        await this.jobsRegistryService.startNextJob(
          [job.asset],
          job.workerName,
        );
      },
    },
    {
      id: WorkerName.HTTPX,
      description:
        'HTTPX is a fast and multi-purpose HTTP toolkit that allows you to run multiple HTTP requests against a target.',
      command:
        'httpx -u {{value}} -status-code -favicon -asn -title -web-server -tech-detect -ip -cname -location -tls-grab -cdn -probe -json -follow-redirects -timeout 10 -threads 100 -silent',
      resultHandler: async ({ result, job, dataSource }: ResultHandler) => {
        console.log(result);
        this.updateResultToDatabase(dataSource, job, JSON.parse(result));
        await this.jobsRegistryService.startNextJob(
          [job.asset],
          job.workerName,
        );
      },
    },
  ];

  /**
   * Updates the result of a job with the given worker ID.
   * @param dataSource the DataSource to use for the update
   * @param job the job to update
   * @param result the result of the job
   */
  private updateResultToDatabase(
    dataSource: DataSource,
    job: Job,
    result: any,
  ) {
    // Update parsed result to database
    dataSource
      .createQueryBuilder()
      .update(Job)
      .set({
        rawResult: result,
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
      })
      .where('id = :id', { id: job.id })
      .execute();
  }

  /**
   * Finds a worker by name.
   * @param workerName the name of the worker to find
   * @returns the worker step, or undefined if not found
   */
  public getWorkerStepByName(workerName: WorkerName): Worker | undefined {
    return this.workers.find((step) => step.id === workerName);
  }

  /**
   * Handles a worker's "alive" signal, which is sent
   * whenever a worker boots up or restarts.
   *
   * @param req The express request.
   * @param res The express response.
   * @param workerId The worker's unique identifier.
   */
  public async alive(dto: WorkerAliveDto) {
    const result = await this.repo.update(
      {
        token: dto.token,
      },
      {
        lastSeenAt: new Date(),
      },
    );
    if (result.affected === 0) {
      throw new UnauthorizedException('Invalid token');
    }
    return {
      alive: 'OK',
    };
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
      const token = generateToken(48);
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
        INSERT INTO workers (id, "workerName", "workerIndex", "token")
        SELECT $2, $1, i, $3 FROM next_index
        RETURNING "workerIndex";
      `,
        [workerName, id, token],
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
  @Interval(15 * 1000)
  async autoRemoveWorkersOffline() {
    const workers = await this.repo
      .find({
        where: {
          lastSeenAt: LessThan(new Date(Date.now() - 15 * 1000)),
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
    await this.jobsRegistryService.repo
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
  public async getWorkerById(id: string): Promise<WorkerInstance | null> {
    const worker = await this.repo.findOne({
      where: { id },
    });

    if (!worker) {
      throw new NotFoundException(`Worker with ID ${id} not found`);
    }

    return worker;
  }

  /**
   * Retrieves a paginated list of workers.
   *
   * @param query - The query parameters for filtering and pagination,
   *                including page, limit, sortOrder, and sortBy.
   * @returns A promise that resolves to a paginated list of workers
   *          along with total count and pagination information.
   */
  public async getWorkers(
    query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<WorkerInstance>> {
    const { page, limit, sortOrder } = query;
    let { sortBy } = query;
    if (!sortBy) {
      sortBy = 'createdAt';
    }

    const [workers, total] = await this.repo.findAndCount({
      order: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return getManyResponse(query, workers, total);
  }
  public async join(dto: WorkerJoinDto): Promise<WorkerInstance | null> {
    const { workerName, token } = dto;

    // Retrieve the admin token from configuration
    const adminToken = this.configService.get('OASM_ADMIN_TOKEN');

    // Validate the provided token against the admin token
    if (token !== adminToken) {
      throw new UnauthorizedException('Invalid token');
    }

    // Generate a unique ID for the new worker instance
    const workerId = randomUUID();

    // Register the worker in the database using the internal method
    await this.workerJoin(workerId, workerName);

    // Fetch and return the newly created worker instance from the repository
    return this.repo.findOne({
      where: {
        id: workerId,
      },
    });
  }
}
