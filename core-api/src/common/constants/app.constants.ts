export const BEFORE_HOOK_KEY = Symbol('BEFORE_HOOK');
export const AFTER_HOOK_KEY = Symbol('AFTER_HOOK');
export const HOOK_KEY = Symbol('HOOK');
export const AUTH_INSTANCE_KEY = Symbol('AUTH_INSTANCE');
export const AUTH_MODULE_OPTIONS_KEY = Symbol('AUTH_MODULE_OPTIONS');
export const ROLE_METADATA_KEY = Symbol('ROLE_METADATA_KEY');
export const DEFAULT_PORT = 6276;
export const DEFAULT_GRPC_PORT = 16276;
export const API_GLOBAL_PREFIX = 'api';
export const APP_NAME = 'Open Attack Surface Management';
export const DEFAULT_ADMIN_ID = '00bd7b24-2f88-4e2f-84e0-835bf28e7905';
export const WORKER_TIMEOUT = 60000; // milliseconds
export const LIMIT_WORKSPACE_CREATE = 5;
export const API_KEY_LENGTH = 36;
export const MCP_API_KEY_HEADER = 'x-oasm-api-key';
/** Controller path (under API_GLOBAL_PREFIX) that authenticates with MCP_API_KEY_HEADER instead of a session. */
export const MCP_AUTH_PATH = 'mcp';
export const WORKER_TOKEN_HEADER = 'worker-token';
/**
 * Controller paths (under API_GLOBAL_PREFIX) that authenticate with
 * MCP_API_KEY_HEADER via McpGuard instead of a browser session.
 *
 * Deliberately narrow: every entry here is removed from the global AuthGuard
 * for the whole sub-tree, so a path added here becomes unauthenticated for every
 * method beneath it. Keep this list to controllers that actually carry
 * `@UseGuards(McpGuard)` on all of their routes.
 */
export const AUTH_IGNORE_ROUTERS = ['mcp'];
export const WEBAPP_ANALYZER_SRC_URL =
  'https://raw.githubusercontent.com/oasm-platform/webappanalyzer/main/src';
export const GET_WORKSPACE_MCP_TOOL_NAME = 'get_workspaces';
export const WORKSPACE_COOKIE_NAME = 'wid';
export const WORKSPACE_HEADER_NAME = 'X-Workspace-Id';
export const CACHE_STATIC_RESOURCE = 14 * 24 * 60 * 60; // 14 days in seconds
export const BOT_ID = '019b3ae4-189e-7dfe-b10e-20d847717733';
export const BOT_EMAIL = 'bot@oasm.local';
export const BOT_NAME = 'Cai';
export const STORAGE_BASE_PATH = '/api/storage';
export const GITHUB_REPO = 'oasm-platform/open-asm';
export const DEFAULT_ENCRYPTION_KEY = 'OASM_DEFAULT_ENCRYPTION_KEY';

// --- Jobs registry ---------------------------------------------------------

/**
 * Hard ceiling on a single batched job claim. A worker sizes its claim from its
 * free concurrency slots, but must never be able to drain an unbounded slice of
 * the queue in one request.
 */
export const MAX_JOB_CLAIM_SIZE = 100;

/**
 * How long a worker row may be served from cache during job claims. Kept short
 * because the row carries the routing fields (`internalNetworkId`, `tool`) that
 * decide which jobs a worker may claim — a long TTL lets a worker keep claiming
 * for a scope it no longer has.
 */
export const WORKER_CLAIM_CACHE_MS = 5_000;

/**
 * How far back the dashboard timeline looks. The timeline query runs two window
 * functions over every job of the workspace and then keeps only the newest 15
 * groups, so without a bound it scans the whole job history on every dashboard
 * load.
 */
export const TIMELINE_LOOKBACK_DAYS = 30;

/**
 * How many times a FAILED job may be automatically requeued before it is left
 * failed for a human to look at. Mirrors the increment in
 * `JobsRegistryService.handleJobError`.
 */
export const JOB_MAX_RETRIES = 4;

/**
 * Cap on the running jobs returned per worker detail response. The console
 * polls that endpoint, so the payload is bounded on purpose; `currentJobsCount`
 * still reports the true total.
 */
export const MAX_RUNNING_JOBS_PER_WORKER = 20;

/**
 * Age at which terminal jobs are pruned from `jobs` (~6 months).
 *
 * Their `job_histories` rows are deliberately NOT pruned: `http_responses`,
 * `discovered_urls` and `ports` reference a history with ON DELETE CASCADE, so
 * deleting a history would destroy the workspace's actual scan results.
 */
export const JOB_RETENTION_DAYS = 6 * 30;

/**
 * Rows removed per retention statement. Chunking keeps a first run on a large
 * `jobs` table from holding locks for the whole prune.
 */
export const JOB_RETENTION_DELETE_BATCH = 10_000;

// --- Event bus -------------------------------------------------------------

/** Redis Stream key every event lands on (`EventBridgeService` publishes here). */
export const EVENT_BUS_STREAM = 'oasm:events';

/**
 * CloudEvents `source` for the core-api process. Absolute URI because the spec
 * RECOMMENDS it, and fixed because uniqueness comes from `id` (a fresh UUID per
 * event), not from the source.
 */
export const EVENT_BUS_SOURCE = 'oasm://core-api';

/**
 * Stream retention: `MAXLEN ~ n` on every XADD plus a 7-day TTL on the key.
 *
 * `~` is an approximate trim (Redis may keep a few extra entries per
 * macro-node), which is what makes retention O(1) instead of O(n) — the
 * alternative is a full trim on every write. 7 days is a LOWER BOUND on
 * replay: anything older is read from `audit_events`, which the retention
 * service keeps for 90 days.
 */
export const EVENT_BUS_MAXLEN = 100_000;
export const EVENT_BUS_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Dead-letter stream per workspace: `oasm:events:dlq:{workspaceId}`. */
export const eventBusDlqKey = (workspaceId: string): string =>
  `oasm:events:dlq:${workspaceId}`;

/**
 * Consumer group names live in {@link EventBusGroup} (`common/enums/enum.ts`),
 * not here: a group name is shared between the lane's config and its consumer
 * loop, so it is a closed set rather than a bag of constants. An `email` group
 * is deliberately absent until a mail transport exists — see the enum.

/** Consumer loop: entries per XREADGROUP call and the BLOCK timeout. */
export const EVENT_BUS_READ_COUNT = 16;
export const EVENT_BUS_READ_BLOCK_MS = 5_000;

/**
 * Retry policy for a handler that throws: the entry stays in the group's PEL,
 * and once it has been idle this long another instance claims it with
 * XAUTOCLAIM. After EVENT_BUS_MAX_ATTEMPTS deliveries it goes to the DLQ
 * instead of retrying forever.
 */
export const EVENT_BUS_CLAIM_MIN_IDLE_MS = 30_000;
export const EVENT_BUS_MAX_ATTEMPTS = 5;

/**
 * Distributed lock guarding the `audit` consumer loop. Held per read cycle
 * rather than for process lifetime: the group must run on exactly ONE instance
 * to keep the materialized view strictly ordered, but a lifetime lock would
 * strand the loop on whichever instance won the boot race and never fail over.
 */
export const EVENT_BUS_AUDIT_LOCK_KEY = 'event-bus:audit-consumer';
export const EVENT_BUS_AUDIT_LOCK_TTL_MS = 10_000;
