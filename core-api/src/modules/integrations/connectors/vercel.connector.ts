import { Logger, BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { IntegrationType } from '@/common/enums/enum';
import type { TargetType } from '../../targets/entities/target.entity';
import { TargetSource } from '../../targets/entities/target.entity';
import {
  CloudProviderConnector,
  type CloudProviderSyncConfig,
  type ConnectorConfig,
  type ConnectorSyncResult,
} from './connector.abstract';

/**
 * Vercel API — pagination safety caps.
 * Prevents infinite loops against a misbehaving/compromised token.
 */
const VERCEL_API_BASE = 'https://api.vercel.com';
const PROJECTS_PAGE_SIZE = 100; // API max per page
const DOMAINS_PAGE_SIZE = 100; // API max per page
const MAX_PROJECT_PAGES = 2000; // max 2000 project pages before we bail
const MAX_DOMAIN_PAGES_PER_PROJECT = 1000; // max 1000 domain pages per project
const MAX_REQUEST_ATTEMPTS = 3; // 429/5xx retries per request
const DEFAULT_RETRY_AFTER_SECONDS = 5; // 429 fallback when no usable body/header
const DEFAULT_5XX_RETRY_AFTER_SECONDS = 2; // 5xx fallback
const MAX_RETRY_AFTER_SECONDS = 60;
/** Per-request deadline: a hung Vercel connection must not stall the sync
 * queue (one stuck repeat job would block every integration sync). */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Canonical 7-key empty dnsRecords shape. Vercel's domain API exposes no DNS
 * records, so every ingested asset starts empty — the scanners fill them in
 * later. The upsert must NOT pass `replaceDnsRecords` (which would `orUpdate`
 * the apex row with this empty shape and wipe scanner-discovered records).
 */
const EMPTY_DNS_RECORDS = {
  A: [],
  AAAA: [],
  CNAME: [],
  MX: [],
  NS: [],
  SOA: [],
  TXT: [],
};

/** A Vercel project (only the fields the sync reads). */
export interface VercelProject {
  id: string;
  name: string;
}

/** A Vercel project domain row. `redirect`/`gitBranch`/`customEnvironmentId`
 * mark proxy/preview hosts that must never become scan targets. */
export interface VercelProjectDomain {
  name: string;
  apexName: string;
  verified: boolean;
  redirect?: string;
  gitBranch?: string;
  customEnvironmentId?: string;
}

/** `/v10/projects` 200 body — a bare array OR the paginated object form. */
export interface VercelProjectsPayload {
  projects?: VercelProject[];
  pagination?: { next?: string | number | null };
}

/** `/v9/projects/{id}/domains` 200 body — `domains` is always an array. */
export interface VercelDomainsPayload {
  domains?: VercelProjectDomain[];
  pagination?: { next?: string | number | null };
}

/** Error envelope Vercel returns on 429 — `limit.reset` is epoch SECONDS,
 * `limit.resetMs` is epoch MILLISECONDS (both absolute, not deltas). */
export interface VercelApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    limit?: {
      remaining?: number;
      reset?: number;
      resetMs?: number;
      total?: number;
    };
  };
}

/**
 * Result of one Vercel asset sync.
 */
export interface SyncResult extends ConnectorSyncResult {
  /** Projects fetched from the API. */
  projects: number;
  /** Domains that passed the exclusion filter and were grouped (todo 2
   * persists them; this todo only discovers). */
  domains: number;
  /** Set in test mode (__dryRun) only — 'active' when the credential probe succeeds. */
  tokenStatus?: string;
  /** True when a page cap, an incomplete page or the sync deadline cut the run short. */
  truncated: boolean;
}

/**
 * Raised for any Vercel API-level failure (HTTP error, page cap, 429
 * exhaustion, malformed pagination). Callers can distinguish sync failures
 * from programming errors.
 */
export class VercelSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VercelSyncError';
  }
}

/**
 * Runtime config assembled by IntegrationSyncService and injected into the
 * connector. Shared shape lives on {@link CloudProviderSyncConfig}; the
 * Vercel-specific credential + optional team scope are added here.
 */
export interface VercelSyncConfig extends CloudProviderSyncConfig {
  apiToken: string;
  teamId?: string;
}

/**
 * Vercel integration connector — transport + discovery layer.
 *
 * - Projects come from `GET /v10/projects`; a bare array response or a
 *   `{projects, pagination}` object are both accepted.
 * - Each project's domains come from `GET /v9/projects/{id}/domains`,
 *   including the default `.vercel.app` host and live-but-unverified custom
 *   domains.
 * - Wildcard, redirect, branch and custom-environment hosts are dropped by
 *   {@link isExcludedDomain}.
 * - Custom domains are grouped by `apexName`; default `.vercel.app` hosts are
 *   grouped by their full hostname — see {@link groupingKey}.
 */
export class VercelConnector extends CloudProviderConnector {
  private readonly logger = new Logger(VercelConnector.name);

  override readonly category = IntegrationType.CLOUD_PROVIDER;

  override beforeExecute(config: ConnectorConfig): Promise<void> {
    const { apiToken } = config as unknown as VercelSyncConfig;
    if (!apiToken) {
      throw new Error('Vercel sync requires apiToken in config');
    }
    return Promise.resolve();
  }

  override async afterExecute(_config: ConnectorConfig): Promise<void> {
    // no-op
  }

  async syncAssets(config: ConnectorConfig): Promise<SyncResult> {
    const cfg = config as unknown as VercelSyncConfig;
    const { integrationId, __dryRun } = cfg;

    // Test mode: verify the credential with a single lightweight API call
    // instead of a full project/domain sync. `GET /v10/projects?limit=1`
    // proves the project-read permission the real sync needs. NOTE: it does
    // NOT separately prove the per-project domains read, so a mid-sync 403 on
    // `/v9/projects/{id}/domains` remains possible — the full sync surfaces it.
    if (__dryRun) {
      await this.vercelFetch<unknown>(cfg, `/v10/projects?limit=1`);
      const result: SyncResult = {
        projects: 0,
        domains: 0,
        truncated: false,
        targetsCreated: 0,
        assetsUpserted: 0,
        tokenStatus: 'active',
      };
      this.logger.log(
        `Vercel test finished for integration ${integrationId}: ${JSON.stringify(result)}`,
      );
      // Stash the counts on the config so runSync can return them to the API
      // without coupling to the connector factory's result message.
      cfg.__syncResult = result;
      return result;
    }

    const startedAt = Date.now();
    const projectsResult = await this.fetchAllProjects(cfg, startedAt);
    const result: SyncResult = {
      projects: projectsResult.projects.length,
      domains: 0,
      truncated: projectsResult.truncated,
      targetsCreated: 0,
      assetsUpserted: 0,
    };

    // The deadline is enforced inside every pagination loop; if the project
    // phase already ran out of time, do not start the domains phase at all.
    if (this.isPastDeadline(cfg, startedAt)) {
      result.truncated = true;
      this.logger.log(
        `Vercel sync finished for integration ${integrationId}: ${JSON.stringify(result)}`,
      );
      cfg.__syncResult = result;
      return result;
    }

    const discovered: VercelProjectDomain[] = [];
    for (const project of projectsResult.projects) {
      if (this.isPastDeadline(cfg, startedAt)) {
        result.truncated = true;
        break;
      }
      const domainsResult = await this.fetchAllProjectDomains(
        cfg,
        project.id,
        startedAt,
      );
      if (domainsResult.truncated) result.truncated = true;
      discovered.push(...domainsResult.domains);
    }

    // Global grouping by apexName — one target per group.
    const groups = this.groupByApex(discovered);
    result.domains = [...groups.values()].reduce(
      (count, hosts) => count + hosts.length,
      0,
    );

    // Dedupe key `${targetId}:${value}` across the whole sync, so a hostname
    // seen under the same target (e.g. two projects sharing an apex) is only
    // upserted once.
    const seenAssets = new Set<string>();

    for (const [apex, hosts] of groups) {
      if (this.isPastDeadline(cfg, startedAt)) {
        result.truncated = true;
        break;
      }

      const targetId = await this.ensureTarget(apex, cfg, result);

      // The apex is upserted only when the API actually returned it as a
      // verified domain for this group — never fabricated. `hosts` already
      // contains the apex iff it appeared in the fetched list.
      const pending: Array<{ value: string; dnsRecords: typeof EMPTY_DNS_RECORDS }> =
        [];
      for (const value of hosts) {
        const key = `${targetId}:${value}`;
        if (seenAssets.has(key)) continue;
        seenAssets.add(key);
        pending.push({ value, dnsRecords: EMPTY_DNS_RECORDS });
      }

      if (pending.length === 0) continue;
      // opts is deliberately undefined: the empty dnsRecords must never
      // replace existing scanner-discovered apex records.
      const inserted = await cfg.dataAdapterService.upsertAssetsByTargetId(
        targetId,
        pending,
        undefined,
        undefined,
      );
      result.assetsUpserted += inserted;
    }

    this.logger.log(
      `Vercel sync finished for integration ${integrationId}: ${JSON.stringify(result)}`,
    );
    // Stash the counts on the config so runSync can return them to the API
    // without coupling to the connector factory's result message.
    cfg.__syncResult = result;
    return result;
  }

  /**
   * Ensure a Target exists for the apex. Returns the target id.
   * On a duplicate-creation race (another sync created the same target
   * between lookup and insert) the "Target already exists" BadRequestException
   * OR the unique-constraint violation (Postgres 23505, surfaced as
   * QueryFailedError.driverError.code) is caught and the target is re-looked-up.
   */
  private async ensureTarget(
    apex: string,
    cfg: VercelSyncConfig,
    result: SyncResult,
  ): Promise<string> {
    const { workspaceId, targetsService, actingUserContext } = cfg;
    const existing = await targetsService.findByWorkspaceAndValues(workspaceId, [
      apex,
    ]);
    const existingTarget = existing.find((t) => t.value === apex);
    if (existingTarget) return existingTarget.id;

    try {
      const created = await targetsService.createMultipleTargets(
        { targets: [{ value: apex, type: 'DOMAIN' as TargetType }] },
        workspaceId,
        actingUserContext,
        undefined,
        TargetSource.VERCEL,
      );
      result.targetsCreated++;
      return created.created[0].id;
    } catch (error) {
      if (this.isDuplicateTargetError(error)) {
        const reFound = await targetsService.findByWorkspaceAndValues(
          workspaceId,
          [apex],
        );
        const reTarget = reFound.find((t) => t.value === apex);
        if (reTarget) return reTarget.id;
      }
      throw error;
    }
  }

  /** True when a create-target failure means "already exists" (app-level
   * BadRequestException or a Postgres unique-constraint violation). */
  private isDuplicateTargetError(error: unknown): boolean {
    if (
      error instanceof BadRequestException &&
      error.message.startsWith('Target already exists')
    ) {
      return true;
    }
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as { code?: string } | undefined;
      return driverError?.code === '23505';
    }
    return false;
  }

  /**
   * Group domains globally by their {@link groupingKey}.
   * Rows failing {@link isExcludedDomain} or whose key is not a valid root
   * domain are skipped; the shared base domain `vercel.app` is hard-rejected
   * as a grouping key (a target must be a real, per-project domain).
   */
  private groupByApex(
    domains: VercelProjectDomain[],
  ): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const domain of domains) {
      if (this.isExcludedDomain(domain)) continue;
      const key = this.groupingKey(domain);
      if (!key || key.toLowerCase() === 'vercel.app') continue;
      if (!this.isValidApex(key)) continue;
      const hosts = groups.get(key);
      if (hosts) {
        hosts.push(domain.name);
      } else {
        groups.set(key, [domain.name]);
      }
    }
    return groups;
  }

  /**
   * Custom domains group by their apex (one target per registrable domain).
   * A generated `<project>.vercel.app` host shares the `vercel.app` apex with
   * every Vercel customer, so it is keyed by its full hostname instead — the
   * apex would otherwise collapse unrelated projects into one bogus target.
   */
  private groupingKey(d: VercelProjectDomain): string {
    if (/(^|\.)vercel\.app$/i.test(d.name)) return d.name;
    return d.apexName;
  }

  /**
   * A domain is excluded from scanning when it is a wildcard, a redirect, or a
   * preview (branch/custom-environment) host. Default `<project>.vercel.app`
   * domains and live-but-unverified custom domains ARE included.
   */
  private isExcludedDomain(d: VercelProjectDomain): boolean {
    const isPresent = (value: unknown): boolean =>
      value !== undefined && value !== null;
    return (
      d.name.startsWith('*') ||
      isPresent(d.redirect) ||
      isPresent(d.gitBranch) ||
      isPresent(d.customEnvironmentId)
    );
  }

  /** Root-domain check — mirrors `targets.service.ts` `validateTargetValue`. */
  private isValidApex(apex: string): boolean {
    return /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(apex);
  }

  /**
   * Fetch every project, following `pagination.next` verbatim into `from=`.
   * `/v10/projects` has no `until` parameter — `from` is the only cursor.
   * The 200 body is either a bare array (no pagination info; length == page
   * size means completeness cannot be assumed → truncated) or an object with
   * `pagination.next` (a string continuation token or a numeric timestamp).
   */
  private async fetchAllProjects(
    cfg: VercelSyncConfig,
    startedAt: number,
  ): Promise<{ projects: VercelProject[]; truncated: boolean }> {
    const projects: VercelProject[] = [];
    let from: string | undefined;
    let lastFrom: string | undefined;
    let pages = 0;

    for (;;) {
      if (this.isPastDeadline(cfg, startedAt)) {
        return { projects, truncated: true };
      }
      pages++;
      if (pages > MAX_PROJECT_PAGES) {
        throw new VercelSyncError('Vercel projects page cap exceeded');
      }

      const path =
        from === undefined
          ? `/v10/projects?limit=${PROJECTS_PAGE_SIZE}`
          : `/v10/projects?limit=${PROJECTS_PAGE_SIZE}&from=${from}`;
      const raw: unknown = await this.vercelFetch<unknown>(cfg, path);

      if (Array.isArray(raw)) {
        projects.push(...(raw as VercelProject[]));
        return {
          projects,
          truncated: raw.length >= PROJECTS_PAGE_SIZE,
        };
      }

      const payload = (raw ?? {}) as VercelProjectsPayload;
      projects.push(...(payload.projects ?? []));
      const next = payload.pagination?.next;
      if (next === null || next === undefined) {
        return { projects, truncated: false };
      }
      if (typeof next !== 'string' && typeof next !== 'number') {
        throw new VercelSyncError(
          'Vercel projects pagination cursor has an unsupported type',
        );
      }
      const nextFrom = String(next);
      if (nextFrom === lastFrom) {
        throw new VercelSyncError(
          'Vercel projects pagination cursor did not advance',
        );
      }
      lastFrom = nextFrom;
      from = nextFrom;
    }
  }

  /**
   * Fetch one project's production + verified custom domains, following
   * `pagination.next` into `until=` (the domains cursor is a timestamp).
   */
  private async fetchAllProjectDomains(
    cfg: VercelSyncConfig,
    projectId: string,
    startedAt: number,
  ): Promise<{ domains: VercelProjectDomain[]; truncated: boolean }> {
    const domains: VercelProjectDomain[] = [];
    // `verified=true` is deliberately NOT sent: it gates the TXT ownership
    // challenge, not live DNS, so it would hide domains still pending
    // verification without filtering anything unsafe. Redirect, branch and
    // custom-environment proxies are dropped server-side by `redirects=false`
    // and client-side by {@link isExcludedDomain}.
    const basePath = `/v9/projects/${encodeURIComponent(projectId)}/domains?production=true&redirects=false&limit=${DOMAINS_PAGE_SIZE}&order=DESC`;
    let until: string | undefined;
    let lastUntil: string | undefined;
    let pages = 0;

    for (;;) {
      if (this.isPastDeadline(cfg, startedAt)) {
        return { domains, truncated: true };
      }
      pages++;
      if (pages > MAX_DOMAIN_PAGES_PER_PROJECT) {
        throw new VercelSyncError('Vercel domains page cap exceeded');
      }

      const path =
        until === undefined ? basePath : `${basePath}&until=${until}`;
      const payload = (await this.vercelFetch<unknown>(
        cfg,
        path,
      )) as VercelDomainsPayload;
      domains.push(...(payload?.domains ?? []));
      const next = payload?.pagination?.next;
      if (next === null || next === undefined) {
        return { domains, truncated: false };
      }
      if (typeof next !== 'string' && typeof next !== 'number') {
        throw new VercelSyncError(
          'Vercel domains pagination cursor has an unsupported type',
        );
      }
      const nextUntil = String(next);
      if (nextUntil === lastUntil) {
        throw new VercelSyncError(
          'Vercel domains pagination cursor did not advance',
        );
      }
      lastUntil = nextUntil;
      until = nextUntil;
    }
  }

  /** Deadline gate — a breach never throws, it truncates. */
  private isPastDeadline(cfg: VercelSyncConfig, startedAt: number): boolean {
    const maxDuration = cfg.maxSyncDurationMs;
    if (maxDuration === undefined) return false;
    return Date.now() - startedAt >= maxDuration;
  }

  /** Build the absolute request URL, appending the optional team scope. */
  private buildPath(path: string, teamId?: string): string {
    const base = `${VERCEL_API_BASE}${path}`;
    if (!teamId) return base;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}teamId=${encodeURIComponent(teamId)}`;
  }

  /**
   * Single Vercel request with 429/5xx retry handling.
   * Up to MAX_REQUEST_ATTEMPTS attempts, then throws VercelSyncError.
   */
  private async vercelFetch<T>(
    cfg: VercelSyncConfig,
    path: string,
  ): Promise<T> {
    const url = this.buildPath(path, cfg.teamId);
    let attempts = 0;

    for (;;) {
      attempts++;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${cfg.apiToken}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        // Network failure OR AbortSignal.timeout rejection — both surface as
        // a domain-specific error so callers never see a raw fetch error.
        throw new VercelSyncError(
          `Vercel API request failed for ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      // Transient failures: rate limit (429) and server errors (5xx) are
      // retried with the body-derived backoff when present, else the
      // per-class default. The body is consumed as text first so the
      // connection can be reused for the retry.
      if (response.status === 429 || response.status >= 500) {
        const body = await response.text();
        if (attempts >= MAX_REQUEST_ATTEMPTS) {
          const kind =
            response.status === 429
              ? 'rate limited (429)'
              : `server error (${response.status})`;
          throw new VercelSyncError(
            `Vercel API ${kind} after ${attempts} attempts for ${path}: ${body.slice(0, 500)}`,
          );
        }
        const retryAfterHeader = response.headers.get('retry-after');
        const delaySeconds = this.parseRetryDelaySeconds(
          response.status,
          body,
          retryAfterHeader,
        );
        this.logger.warn(
          `Vercel API ${response.status} for ${path}, retrying in ${delaySeconds}s (attempt ${attempts}/${MAX_REQUEST_ATTEMPTS})`,
        );
        await this.sleep(delaySeconds * 1000);
        continue;
      }

      if (!response.ok) {
        const bodySnippet = (await response.text()).slice(0, 500);
        throw new VercelSyncError(
          `Vercel API error ${response.status} for ${path}: ${bodySnippet}`,
        );
      }

      return (await response.json()) as T;
    }
  }

  /**
   * Compute the retry delay in seconds for a transient failure.
   * - 429: prefer `error.limit.resetMs` (absolute epoch-ms), then
   *   `error.limit.reset` (absolute epoch-seconds), then an optional
   *   `Retry-After` header, then DEFAULT_RETRY_AFTER_SECONDS.
   * - 5xx: DEFAULT_5XX_RETRY_AFTER_SECONDS.
   * Every derived delay is clamped to [1, MAX_RETRY_AFTER_SECONDS].
   */
  private parseRetryDelaySeconds(
    status: number,
    body: string,
    retryAfterHeader: string | null,
  ): number {
    if (status === 429) {
      const limit = this.parseErrorLimit(body);
      if (limit) {
        if (typeof limit.resetMs === 'number' && Number.isFinite(limit.resetMs)) {
          return this.clampRetrySeconds(
            Math.ceil((limit.resetMs - Date.now()) / 1000),
          );
        }
        if (typeof limit.reset === 'number' && Number.isFinite(limit.reset)) {
          return this.clampRetrySeconds(
            Math.ceil(limit.reset - Date.now() / 1000),
          );
        }
      }
      const headerSeconds = this.parseRetryAfterHeader(retryAfterHeader);
      if (headerSeconds !== null) return headerSeconds;
      return DEFAULT_RETRY_AFTER_SECONDS;
    }
    return DEFAULT_5XX_RETRY_AFTER_SECONDS;
  }

  /** Guarded JSON parse of a 429 error body — a parse failure returns null. */
  private parseErrorLimit(
    body: string,
  ): { reset?: number; resetMs?: number } | null {
    try {
      const parsed = JSON.parse(body) as VercelApiErrorPayload | null;
      return parsed?.error?.limit ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Parse the `retry-after` header. Returns the delay in seconds or null when
   * the header is absent/unparseable.
   */
  private parseRetryAfterHeader(raw: string | null): number | null {
    if (!raw) return null;
    const seconds = Number.parseInt(raw, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return this.clampRetrySeconds(seconds);
    }
    const dateMs = Date.parse(raw);
    if (!Number.isNaN(dateMs)) {
      return this.clampRetrySeconds(Math.ceil((dateMs - Date.now()) / 1000));
    }
    return null;
  }

  private clampRetrySeconds(seconds: number): number {
    return Math.min(Math.max(Math.ceil(seconds), 1), MAX_RETRY_AFTER_SECONDS);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
