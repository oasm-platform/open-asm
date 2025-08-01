import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { pick } from 'lodash';
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
      id: 'subfinder',
      name: 'Subfinder',
      category: ToolCategory.SUBDOMAINS,
      description:
        'Subfinder is a subdomain discovery tool that returns valid subdomains for websites, using passive online sources.',
      logoUrl:
        'https://raw.githubusercontent.com/projectdiscovery/subfinder/refs/heads/main/static/subfinder-logo.png',
      command:
        '(echo {{value}} && subfinder -d {{value}}) | dnsx -a -aaaa -cname -mx -ns -soa -txt -resp',
      resultHandler: this.handleSubfinderResult.bind(this),
    },
    {
      id: 'httpx',
      name: 'Httpx',
      category: ToolCategory.HTTP_SCRAPER,
      description:
        'Httpx is a fast and multi-purpose HTTP toolkit that allows running multiple probes using the retryable http library. It is designed to maintain result reliability with an increased number of threads.',
      logoUrl:
        'https://raw.githubusercontent.com/projectdiscovery/httpx/main/static/httpx-logo.png',
      command:
        'httpx -u {{value}} -status-code -favicon -asn -title -web-server -irr -tech-detect -ip -cname -location -tls-grab -cdn -probe -json -follow-redirects -timeout 10 -threads 100 -silent',
      resultHandler: this.handleHttpxResult.bind(this),
    },
    {
      id: 'naabu',
      name: 'Naabu',
      category: ToolCategory.PORTS_SCANNER,
      description:
        'A fast port scanner written in go with a focus on reliability and simplicity. Designed to be used in combination with other tools for attack surface discovery in bug bounties and pentests.',
      logoUrl:
        'https://raw.githubusercontent.com/projectdiscovery/naabu/refs/heads/main/static/naabu-logo.png',
      command: 'naabu -host {{value}} -silent',
      resultHandler: this.handleNaabuResult.bind(this),
    },
  ];

  /**
   * Handles the result of the Subfinder tool.
   * Parses subdomains and their DNS records, then saves them to the database.
   * @param {ResultHandler} handlerData - The data object containing result, job, and dataSource.
   */
  private async handleSubfinderResult({
    result,
    job,
    dataSource,
  }: ResultHandler) {
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

    assets.push(job.asset); // Fill to the asset table

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

    await this.jobsRegistryService.startNextJob({
      assets: assetsWithId,
      nextJob: [ToolCategory.PORTS_SCANNER, ToolCategory.HTTP_SCRAPER],
      jobHistory: job.jobHistory,
    });
  }

  /**
   * Handles the result of the Naabu tool.
   * Parses open ports and updates the job result in the database.
   * @param {ResultHandler} handlerData - The data object containing result, job, and dataSource.
   */
  private async handleNaabuResult({ result, job, dataSource }: ResultHandler) {
    const parsed = result
      .trim()
      .split('\n')
      .filter((i) => i.includes(':'))
      .map((i) => Number(i.split(':')[1].replace('\r', '')))
      .sort();
    this.workerService.updateResultToDatabase(dataSource, job, parsed);
  }

  /**
   * Handles the result of the Httpx tool.
   * Parses HTTP scraping data and updates the asset and job result in the database.
   * @param {ResultHandler} handlerData - The data object containing result, job, and dataSource.
   */
  private async handleHttpxResult({ result, job, dataSource }: ResultHandler) {
    if (result) {
      const parsed = JSON.parse(result);
      this.assetRepo.update(job.asset.id, {
        isErrorPage: parsed.failed,
      });
      this.workerService.updateResultToDatabase(dataSource, job, parsed);
    }
  }

  /**
   * Get a built-in tool by category.
   * @param {ToolCategory} category - The category of the tool.
   * @returns {BuiltInTool | undefined} The built-in tool if found, otherwise undefined.
   */
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

  /**
   * Get all built-in tools.
   * @returns An array of built-in tools.
   */
  async getBuiltInTools() {
    const data = this.builtInTools.map((tool) => ({
      ...pick(tool, ['name', 'category', 'description', 'logoUrl']),
      isInstalled: true,
    }));

    return {
      data,
    };
  }
}
