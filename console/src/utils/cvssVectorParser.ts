export type CVSSVersion = '2.0' | '3.0' | '3.1' | '4.0';

export type MetricValue = {
  value: string;
  name: string;
};

export type CVSSResult = {
  version: CVSSVersion;
  raw: Record<string, string>;
  detailed: Record<string, MetricValue>;
  normalized: Record<string, MetricValue>;
};

// ===============================
// Shared constants (DRY)
// ===============================

const LEVELS = Object.freeze({
  N: 'None',
  L: 'Low',
  H: 'High',
} as const);

// Key → semantic name
const METRIC_NAMES: Record<string, string> = {
  AV: 'attackVector',
  AC: 'attackComplexity',
  AT: 'attackRequirements',
  PR: 'privilegesRequired',
  UI: 'userInteraction',
  S: 'scope',

  C: 'confidentiality',
  I: 'integrity',
  A: 'availability',

  // v4
  VC: 'vulnConfidentiality',
  VI: 'vulnIntegrity',
  VA: 'vulnAvailability',

  SC: 'sysConfidentiality',
  SI: 'sysIntegrity',
  SA: 'sysAvailability',
};

// Value dictionary
const CVSS_DICTIONARY: Record<string, Record<string, string>> = {
  AV: {
    N: 'Network',
    A: 'Adjacent',
    L: 'Local',
    P: 'Physical',
  },
  AC: {
    L: 'Low',
    H: 'High',
  },
  AT: {
    N: 'None',
    P: 'Present',
  },
  PR: LEVELS,
  UI: {
    N: 'None',
    R: 'Required',
  },
  S: {
    U: 'Unchanged',
    C: 'Changed',
  },

  // v3
  C: LEVELS,
  I: LEVELS,
  A: LEVELS,

  // v4
  VC: LEVELS,
  VI: LEVELS,
  VA: LEVELS,
  SC: LEVELS,
  SI: LEVELS,
  SA: LEVELS,
};

// ===============================
// Helpers
// ===============================

function detectVersion(vector: string): CVSSVersion {
  if (vector.startsWith('CVSS:4.0')) return '4.0';
  if (vector.startsWith('CVSS:3.1')) return '3.1';
  if (vector.startsWith('CVSS:3.0')) return '3.0';
  return '2.0';
}

function normalizeVector(vector: string): string {
  return vector.replace(/^CVSS:\d\.\d\//, '');
}

// ===============================
// Main Parser
// ===============================

export function parseCVSS(vector: string): CVSSResult | null {
  if (typeof vector !== 'string') return null;

  const version = detectVersion(vector);
  const clean = normalizeVector(vector);

  const raw: Record<string, string> = {};
  const detailed: Record<string, MetricValue> = {};
  const normalized: Record<string, MetricValue> = {};

  for (const part of clean.split('/')) {
    const [key, value] = part.split(':');
    if (!key || !value) continue;

    // Raw
    raw[key] = value;

    // Human readable value
    const readable = CVSS_DICTIONARY[key]?.[value] ?? 'Unknown';

    // Detailed
    detailed[key] = {
      value,
      name: readable,
    };

    // Normalized (semantic key)
    const normalizedKey = METRIC_NAMES[key] ?? key;

    normalized[normalizedKey] = {
      value,
      name: readable,
    };
  }

  return {
    version,
    raw,
    detailed,
    normalized,
  };
}
