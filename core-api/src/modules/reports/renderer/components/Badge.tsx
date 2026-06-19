import React from 'react';
import { Text, StyleSheet } from '@react-pdf/renderer';
import { severityBadgeStyle, riskBadgeStyle, statusBadgeStyle, statusLabel, toUpper } from '../helpers';

const base = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: '600',
    borderWidth: 1,
    fontFamily: 'Inter',
    textAlign: 'center',
    alignSelf: 'center',
  },
});

interface BadgeProps {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style?: Record<string, any>;
}

const Badge: React.FC<BadgeProps> = ({ label, style }) => (
  <Text style={style ? { ...base.badge, ...style } : base.badge}>{label}</Text>
);

// ── Severity Badge ──────────────────────────────────────────────
interface SeverityBadgeProps {
  severity: string;
  label?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, label }) => {
  const s = severityBadgeStyle(severity);
  return (
    <Badge
      label={label || toUpper(severity)}
      style={{ backgroundColor: s.backgroundColor, color: s.color, borderColor: s.borderColor }}
    />
  );
};

// ── Risk Badge ──────────────────────────────────────────────────
interface RiskBadgeProps {
  level: string;
  label?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, label }) => {
  const s = riskBadgeStyle(level);
  return (
    <Badge
      label={label || toUpper(level)}
      style={{ backgroundColor: s.backgroundColor, color: s.color, borderWidth: 0 }}
    />
  );
};

// ── Status Badge ────────────────────────────────────────────────
interface StatusBadgeProps {
  status: string;
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const s = statusBadgeStyle(status);
  return (
    <Badge
      label={label || statusLabel(status)}
      style={{ backgroundColor: s.backgroundColor, color: s.color, borderColor: s.borderColor }}
    />
  );
};
