import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Severity, ToolCategory, WorkerType } from 'src/common/enums/enum';
import { ResultHandler } from 'src/common/interfaces/app.interface';
import { BuiltInTool } from 'src/common/types/app.types';
import { getManyResponse } from 'src/utils/getManyResponse';
import { DeepPartial, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { StorageService } from '../storage/storage.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkersService } from '../workers/workers.service';
import { GetInstalledToolsDto } from './dto/get-installed-tools.dto';
import { ToolsQueryDto } from './dto/tools-query.dto';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
@Injectable()
export class ToolsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,
    @InjectRepository(WorkspaceTool)
    private readonly workspaceToolRepository: Repository<WorkspaceTool>,

    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,

    @InjectRepository(Vulnerability)
    public readonly vulnerabilityRepo: Repository<Vulnerability>,

    @Inject(forwardRef(() => JobsRegistryService))
    private jobsRegistryService: JobsRegistryService,

    private workerService: WorkersService,

    private storageService: StorageService,
  ) {}

  public builtInTools: BuiltInTool[] = [
    {
      name: 'subfinder',
      category: ToolCategory.SUBDOMAINS,
      description:
        'Subfinder is a subdomain discovery tool that returns valid subdomains for websites, using passive online sources.',
      logoUrl:
        'https://raw.githubusercontent.com/projectdiscovery/subfinder/refs/heads/main/static/subfinder-logo.png',
      command:
        '(echo {{value}} && subfinder -d {{value}}) | dnsx -a -aaaa -cname -mx -ns -soa -txt -resp',
      resultHandler: this.handleSubfinderResult.bind(this),
      version: '2.8.0',
    },
    {
      name: 'httpx',
      category: ToolCategory.HTTP_PROBE,
      description:
        'Httpx is a fast and multi-purpose HTTP toolkit that allows running multiple probes using the retryable http library. It is designed to maintain result reliability with an increased number of threads.',
      logoUrl:
        'https://raw.githubusercontent.com/projectdiscovery/httpx/main/static/httpx-logo.png',
      command:
        'httpx -u {{value}} -status-code -favicon -asn -title -web-server -irr -tech-detect -ip -cname -location -tls-grab -cdn -probe -json -follow-redirects -timeout 10 -threads 100 -silent',
      resultHandler: this.handleHttpxResult.bind(this),
      version: '1.7.1',
    },
    {
      name: 'naabu',
      category: ToolCategory.PORTS_SCANNER,
      description:
        'A fast port scanner written in go with a focus on reliability and simplicity. Designed to be used in combination with other tools for attack surface discovery in bug bounties and pentests.',
      logoUrl:
        'https://raw.githubusercontent.com/projectdiscovery/naabu/refs/heads/main/static/naabu-logo.png',
      command: 'naabu -host {{value}} -silent',
      resultHandler: this.handleNaabuResult.bind(this),
      version: '2.3.5',
    },
    {
      name: 'nuclei',
      category: ToolCategory.VULNERABILITIES,
      description:
        'Nuclei is a fast, customizable vulnerability scanner powered by the global security community and built on a simple YAML-based DSL, enabling collaboration to tackle trending vulnerabilities on the internet. It helps you find vulnerabilities in your applications, APIs, networks, DNS, and cloud configurations.',
      logoUrl:
        'https://raw.githubusercontent.com/projectdiscovery/nuclei/refs/heads/dev/static/nuclei-logo.png',
      command: 'nuclei -u {{value}} -j --silent',
      resultHandler: this.handleNucleiResult.bind(this),
      version: '3.4.7',
    },
  ];

  async onModuleInit() {
    try {
      // Convert builtInTools to Tool entities
      const toolsToInsert = this.builtInTools.map((tool) => ({
        id: randomUUID(),
        name: tool.name,
        category: tool.category,
        description: tool.description,
        logoUrl: tool.logoUrl,
        command: tool.command,
        version: tool.version,
        isBuiltIn: true,
        isOfficialSupport: true,
        type: WorkerType.BUILT_IN,
      }));

      // Insert tools using upsert to avoid duplicates
      await this.toolsRepository
        .createQueryBuilder()
        .insert()
        .orUpdate({
          conflict_target: ['name', 'category'],
          overwrite: ['description', 'logoUrl', 'version'],
        })
        .values(toolsToInsert)
        .execute();
    } catch (error) {
      console.error('Error initializing built-in tools:', error);
    }
  }

  private async handleNucleiResult({ result, job, dataSource }: ResultHandler) {
    if (!result || result.length === 0) {
      return;
    }
    try {
      const initialVulnerabilities = result
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            const finding = JSON.parse(line.trim());
            const vulId = randomUUID();
            const filePath = `${vulId}.json`;
            this.storageService.uploadFile(filePath, Buffer.from(line));
            return {
              id: vulId,
              name: finding['info']['name'] as string,
              description: finding['info']['description'] as string,
              severity: finding['info']['severity'].toLowerCase() as Severity,
              createdAt: new Date(),
              tags: finding['info']['tags'] || [],
              references: finding['info']['reference'] || [],
              authors: finding['info']['author'] || [],
              affectedUrl: finding['matched-at'] as string,
              ipAddress: finding['ip'] as string,
              host: finding['host'] as string,
              port: finding['port']?.toString(),
              cvssMetric: finding['info']['classification']?.[
                'cvss-metrics'
              ] as string,
              cveId: finding['info']['classification']?.[
                'cve-id'
              ]?.[0] as string,
              asset: { id: job.asset.id },
              jobHistoryId: job.jobHistory.id,
              extractorName: finding['extractor-name'] as string,
              extractedResults: finding['extracted-results'] || [],
              filePath,
            };
          } catch (e) {
            console.error('Error processing nuclei result:', e);
            return null;
          }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      const groupedVulnerabilities = new Map<
        string,
        (typeof initialVulnerabilities)[0]
      >();

      for (const vuln of initialVulnerabilities) {
        if (groupedVulnerabilities.has(vuln.name)) {
          const existingVuln = groupedVulnerabilities.get(vuln.name)!;
          existingVuln.tags = [
            ...new Set([...existingVuln.tags, ...vuln.tags]),
          ];
          existingVuln.references = [
            ...new Set([...existingVuln.references, ...vuln.references]),
          ];
          existingVuln.authors = [
            ...new Set([...existingVuln.authors, ...vuln.authors]),
          ];
          existingVuln.extractedResults = [
            ...new Set([
              ...existingVuln.extractedResults,
              ...vuln.extractedResults,
            ]),
          ];
        } else {
          groupedVulnerabilities.set(vuln.name, { ...vuln });
        }
      }

      const vulnerabilitiesData = Array.from(
        groupedVulnerabilities.values(),
      ) as DeepPartial<Vulnerability>[];

      await this.vulnerabilityRepo.save(vulnerabilitiesData, { chunk: 100 });

      this.workerService.updateResultToDatabase({
        dataSource,
        job,
        result: {
          vulnerabilities: vulnerabilitiesData.map((vuln) => ({
            name: vuln.name,
            severity: vuln.severity,
            url: vuln.affectedUrl,
          })),
        },
      });
    } catch (error) {
      console.error('Error processing nuclei results:', error);
      throw error;
    }
  }

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

    this.workerService.updateResultToDatabase({
      dataSource,
      job,
      result: {
        total: Object.keys(parsed).length,
      },
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
      nextJob: [ToolCategory.PORTS_SCANNER, ToolCategory.HTTP_PROBE],
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

    // Save table ports
    dataSource
      .createQueryBuilder()
      .insert()
      .into(Port)
      .values({
        assetId: job.asset.id,
        ports: parsed,
        jobHistoryId: job.jobHistory.id,
      })
      .execute();

    this.workerService.updateResultToDatabase({
      dataSource,
      job,
      result: parsed,
    });
  }

  /**
   * Handles the result of the Httpx tool.
   * Parses HTTP scraping data and updates the asset and job result in the database.
   * @param {ResultHandler} handlerData - The data object containing result, job, and dataSource.
   */
  private async handleHttpxResult({ result, job, dataSource }: ResultHandler) {
    if (!result) return;

    const parsed = JSON.parse(result);

    await Promise.all([
      this.assetRepo.update(job.asset.id, { isErrorPage: parsed.failed }),
      dataSource
        .createQueryBuilder()
        .insert()
        .into(HttpResponse)
        .values({
          assetId: job.asset.id,
          jobHistoryId: job.jobHistory.id,
          ...parsed,
          timestamp: parsed.timestamp ? new Date(parsed.timestamp) : undefined,
        })
        .execute(),
    ]);

    this.workerService.updateResultToDatabase({
      dataSource,
      job,
      result: parsed,
    });
  }

  /**
   * Get a built-in tool by category.
   * @param {ToolCategory} category - The category of the tool.
   * @returns {BuiltInTool | undefined} The built-in tool if found, otherwise undefined.
   */
  public getBuiltInByName(category: ToolCategory): BuiltInTool | undefined {
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
    const data = await this.toolsRepository.find({
      where: {
        type: WorkerType.BUILT_IN,
      },
      order: {
        name: 'ASC',
      },
    });

    return {
      data,
    };
  }

  /**
   * Retrieves a list of tools with pagination.
   * @param {ToolsQueryDto} query - The query parameters.
   * @returns {Promise<GetManyBaseResponseDto<Tool>>} The tools.
   */
  async getManyTools(query: ToolsQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;

    const [data, total] = await this.toolsRepository.findAndCount({
      where: Object.keys(where).length ? where : undefined,
      take: limit,
      skip: skip,
      order: {
        name: 'ASC',
      },
    });
    return getManyResponse(query, data, total);
  }

  async getInstalledTools(dto: GetInstalledToolsDto) {
    const builtInTools = await this.toolsRepository.find({
      where: {
        type: WorkerType.BUILT_IN,
        ...(dto.category && { category: dto.category }),
      },
    });

    const workspaceTools = await this.workspaceToolRepository.find({
      where: {
        workspace: { id: dto.workspaceId },
        ...(dto.category && { tool: { category: dto.category } }),
      },
      relations: ['tool'],
    });

    const installedTools = workspaceTools.map((wt) => wt.tool);

    // Combine built-in and workspace tools, ensuring no duplicates
    const combinedTools = [...builtInTools];
    installedTools.forEach((tool) => {
      if (!combinedTools.some((bt) => bt.id === tool.id)) {
        combinedTools.push(tool);
      }
    });

    return {
      data: combinedTools,
      total: combinedTools.length,
    };
  }
}
