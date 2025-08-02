import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { ToolCategory } from 'src/common/enums/enum';
import { ResultHandler } from 'src/common/interfaces/app.interface';
import { BuiltInTool } from 'src/common/types/app.types';
import { Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { WorkersService } from '../workers/workers.service';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';

@Injectable()
export class ToolsService {
  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,
    @InjectRepository(WorkspaceTool)
    private readonly workspaceToolRepository: Repository<WorkspaceTool>,

    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,

    @Inject(forwardRef(() => JobsRegistryService))
    private jobsRegistryService: JobsRegistryService,

    private workerService: WorkersService,
  ) {}

  public builtInTools: BuiltInTool[] = [
    {
      name: 'subfinder',
      category: ToolCategory.SUBDOMAINS,
      description: 'Fast passive subdomain enumeration tool.',
      logoUrl:
        'https://github.com/projectdiscovery/subfinder/blob/main/static/subfinder-logo.png?raw=true',
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
        this.workerService.updateResultToDatabase(dataSource, job, {
          total: Object.keys(parsed).length,
        });
        const assets: Asset[] = Object.keys(parsed).map((i) => ({
          id: randomUUID(),
          value: i,
          target: { id: job.asset.target.id },
          dnsRecords: parsed[i],
        })) as Asset[];
        assets.push(job.asset);
        // Fill to the asset table
        await Promise.all([
          this.assetRepo
            .createQueryBuilder()
            .insert()
            .values(assets)
            .orIgnore()
            .execute(),

          this.assetRepo.update(job.asset.id, {
            dnsRecords: primaryAsset,
          }),
        ]);
        const assetsWithId = await this.assetRepo.find({
          where: {
            target: { id: job.asset.target.id },
          },
        });
        await this.jobsRegistryService.startNextJob(
          assetsWithId,
          job.category,
          job.jobHistory,
        );
      },
    },
    {
      name: 'naabu',
      category: ToolCategory.PORTS_SCANNER,
      description:
        'A fast port scanner written in go with a focus on reliability and simplicity. Designed to be used in combination with other tools for attack surface discovery in bug bounties and pentests.',
      logoUrl:
        'https://github.com/projectdiscovery/naabu/blob/main/static/naabu-logo.png?raw=true',
      command: 'naabu -host {{value}} -silent',
      resultHandler: async ({ result, job, dataSource }: ResultHandler) => {
        const parsed = result
          .trim()
          .split('\n')
          .filter((i) => i.includes(':'))
          .map((i) => Number(i.split(':')[1].replace('\r', '')))
          .sort();
        this.workerService.updateResultToDatabase(dataSource, job, parsed);

        await this.jobsRegistryService.startNextJob(
          [job.asset],
          job.category,
          job.jobHistory,
        );
      },
    },
    {
      name: 'httpx',
      category: ToolCategory.HTTP_SCRAPER,
      description:
        'HTTPX is a fast and multi-purpose HTTP toolkit that allows you to run multiple HTTP requests against a target.',
      logoUrl:
        'https://raw.githubusercontent.com/projectdiscovery/httpx/main/static/httpx-logo.png',
      command:
        'httpx -u {{value}} -status-code -favicon -asn -title -web-server -irr -tech-detect -ip -cname -location -tls-grab -cdn -probe -json -follow-redirects -timeout 10 -threads 100 -silent',
      resultHandler: async ({ result, job, dataSource }: ResultHandler) => {
        if (result) {
          const parsed = JSON.parse(result);
          this.assetRepo.update(job.asset.id, {
            isErrorPage: parsed.failed,
          });
          this.workerService.updateResultToDatabase(dataSource, job, parsed);
          await this.jobsRegistryService.startNextJob(
            [job.asset],
            job.category,
            job.jobHistory,
          );
        }
      },
    },
  ];

  public getWorkerStepByName(category: ToolCategory): BuiltInTool | undefined {
    return this.builtInTools.find((step) => step.category === category);
  }
  /**
   * Add a tool to a workspace.
   * @throws BadRequestException if the tool already exists in this workspace.
   * @returns The newly created workspace-tool entry.
   */
  async addToolToWorkspace(dto: AddToolToWorkspaceDto): Promise<WorkspaceTool> {
    const existingEntry = await this.workspaceToolRepository.findOne({
      where: { isEnabled: true },
    });

    if (existingEntry) {
      throw new BadRequestException('Tool already exists in this workspace.');
    }

    const newWorkspaceTool = this.workspaceToolRepository.create({
      tool: { id: dto.toolId },
      workspace: { id: dto.workspaceId },
    });
    return this.workspaceToolRepository.save(newWorkspaceTool);
  }
}
