// Original file: proto/jobs_registry.proto

export const Severity = {
  INFO: 'INFO',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type Severity =
  | 'INFO'
  | 0
  | 'LOW'
  | 1
  | 'MEDIUM'
  | 2
  | 'HIGH'
  | 3
  | 'CRITICAL'
  | 4

export type Severity__Output = typeof Severity[keyof typeof Severity]
