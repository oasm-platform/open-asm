import { DataKind, TargetType } from '@/common/enums/enum';

/**
 * Which jobs a workflow step creates, and what each of them receives.
 *
 * A step has an ordered list of input kinds (its tool's `inputs`, or the
 * step's own `input`). For every asset in the run's scope, the planner takes
 * the first kind that has something for that asset and creates one job per
 * item of that kind:
 *
 *   inputs [web, host] on a host with two web services → 2 jobs, one per URL
 *   inputs [web, host] on a host never probed          → 1 job on the host
 *
 * So a tool gets the most precise data the platform has, and still runs on
 * hosts nothing has probed yet. Everything here is pure; the jobs registry
 * loads the rows (see `ScopeData`) and saves the jobs.
 */

/** An asset of the run's scope, with what the planner needs to know. */
export interface ScopeAsset {
  id: string;
  value: string;
  isPrimary: boolean;
  targetType: TargetType;
}

/** An open port of a host. `value` is how it is addressed (`host:port`). */
export interface ScopeService {
  id: string;
  assetId: string;
  value: string;
  port: number;
}

/** A service that answered HTTP(S); `scheme` is from its last good response. */
export interface ScopeWebService extends ScopeService {
  scheme: 'http' | 'https';
}

/** A URL found on a service by URL discovery. */
export interface ScopeUrl {
  url: string;
  assetId: string;
  serviceId: string;
}

/**
 * The rows of a run's scope, per asset. Only the kinds the step asks for are
 * loaded; a missing map means "not needed".
 */
export interface ScopeData {
  assets: ScopeAsset[];
  services?: Map<string, ScopeService[]>;
  web?: Map<string, ScopeWebService[]>;
  urls?: Map<string, ScopeUrl[]>;
}

/** One job to create: the asset (and service) it is about, and its inputs. */
export interface PlannedInput {
  kind: DataKind;
  assetId: string;
  serviceId?: string;
  /**
   * What a connector receives: the same single `target` as always, holding
   * the most precise value of the kind (`host`, `host:port`, a URL). Null
   * for a repository: its inputs and credentials are built when the job is
   * claimed.
   */
  connectorInputs: { target: string } | null;
  /** Placeholders for a built-in tool's command template. */
  commandValues: { value: string; port?: string };
}

/** The kinds whose rows `ScopeData` must load for these inputs. */
export function kindsToLoad(inputs: readonly DataKind[]): {
  services: boolean;
  web: boolean;
  urls: boolean;
} {
  return {
    services: inputs.includes(DataKind.SERVICE),
    web: inputs.includes(DataKind.WEB),
    urls: inputs.includes(DataKind.URL),
  };
}

/** Plans the jobs of one step over the run's scope. */
export function planStepInputs(
  inputs: readonly DataKind[],
  scope: ScopeData,
): PlannedInput[] {
  const planned: PlannedInput[] = [];
  for (const asset of scope.assets) {
    for (const kind of inputs) {
      const items = itemsOf(kind, asset, scope);
      if (items.length > 0) {
        planned.push(...items);
        break;
      }
    }
  }
  return planned;
}

/** `https://host` for the default port, `https://host:8443` otherwise. */
export function webUrl(host: string, scheme: string, port: number): string {
  const defaultPort = scheme === 'https' ? 443 : 80;
  return port === defaultPort
    ? `${scheme}://${host}`
    : `${scheme}://${host}:${port}`;
}

function itemsOf(
  kind: DataKind,
  asset: ScopeAsset,
  scope: ScopeData,
): PlannedInput[] {
  const isRepository = asset.targetType === TargetType.GIT_ORG;
  switch (kind) {
    case DataKind.TARGET:
      return asset.isPrimary && !isRepository ? [onAsset(kind, asset)] : [];

    case DataKind.HOST:
      return isRepository ? [] : [onAsset(kind, asset)];

    case DataKind.REPOSITORY:
      return isRepository
        ? [{ ...onAsset(kind, asset), connectorInputs: null }]
        : [];

    case DataKind.SERVICE:
      return (scope.services?.get(asset.id) ?? []).map((service) => ({
        kind,
        assetId: asset.id,
        serviceId: service.id,
        connectorInputs: { target: service.value },
        commandValues: { value: service.value, port: String(service.port) },
      }));

    case DataKind.WEB:
      return (scope.web?.get(asset.id) ?? []).map((service) => {
        return {
          kind,
          assetId: asset.id,
          serviceId: service.id,
          connectorInputs: {
            target: webUrl(asset.value, service.scheme, service.port),
          },
          commandValues: { value: service.value, port: String(service.port) },
        };
      });

    case DataKind.URL:
      return (scope.urls?.get(asset.id) ?? []).map((found) => ({
        kind,
        assetId: asset.id,
        serviceId: found.serviceId,
        connectorInputs: { target: found.url },
        commandValues: { value: found.url },
      }));

    default:
      // Output-only kinds (vulnerability) are never inputs.
      return [];
  }
}

function onAsset(kind: DataKind, asset: ScopeAsset): PlannedInput {
  return {
    kind,
    assetId: asset.id,
    connectorInputs: { target: asset.value },
    commandValues: { value: asset.value },
  };
}
