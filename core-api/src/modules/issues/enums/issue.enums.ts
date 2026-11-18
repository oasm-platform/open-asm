export enum IssueResolution {
  FIXED = 'fixed',
  ACCEPTED = 'accepted',
  DUPLICATE = 'duplicate',
  WONT_FIX = 'wont_fix',
  OTHER = 'other',
}

/** How an issue rule groups matching resources into one open issue. */
export enum IssueRuleGroupBy {
  NONE = 'none',
  VULNERABILITY_NAME = 'vulnerability_name',
  ASSET = 'asset',
  TARGET = 'target',
}
