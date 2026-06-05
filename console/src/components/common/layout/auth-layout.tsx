import AppLogo from '@/components/ui/app-logo';
import { ArrowRight, Bug, Cpu, ScanSearch, ShieldCheck, Sparkles, Workflow, Zap } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const features = [
  {
    icon: ScanSearch,
    title: 'Discover',
    description: 'and manage assets with auto-grouping and multi-workspace support',
  },
  {
    icon: Bug,
    title: 'Scan',
    description: 'vulnerabilities and misconfigs with issue tracking and risk analysis',
  },
  {
    icon: Cpu,
    title: 'Identify',
    description: 'technologies and services on every discovered asset',
  },
  {
    icon: Zap,
    title: 'High-performance',
    description: 'distributed scanning engine that scales with your perimeter',
  },
  {
    icon: Workflow,
    title: 'Automated',
    description: 'schedules, alerts, and remediation workflows',
  },
  {
    icon: Sparkles,
    title: 'AI Agent',
    description: 'natural language queries and automated remediation guidance',
  },
  {
    icon: ShieldCheck,
    title: 'Risk trends',
    description: 'analytics and detailed reporting across your attack surface',
  },
];

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh w-full bg-background">
      <div className="absolute top-6 left-6 z-20">
        <AppLogo type="large" />
      </div>
      {children}
      <div className="relative hidden lg:flex lg:w-1/2 items-center justify-center overflow-hidden border-l border-border bg-gradient-to-br from-primary/8 via-primary/3 to-background">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, color-mix(in oklch, var(--primary) 18%, transparent) 0, transparent 45%), radial-gradient(circle at 80% 70%, color-mix(in oklch, var(--chart-2) 14%, transparent) 0, transparent 50%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-xl px-12 py-16">
          <div className="mb-10 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Open-source attack surface management
            </div>
            <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground">
              One platform for your entire
              <br />
              <span className="text-primary">external attack surface</span>
            </h2>
            <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              Map assets, find vulnerabilities, and respond to issues — without
              spreadsheets or ten different dashboards.
            </p>
          </div>

          <ul className="grid gap-2.5">
            {features.map(({ icon: Icon, title, description }) => (
              <li
                key={title}
                className="group flex items-start gap-3 rounded-lg border border-transparent bg-background/40 p-2.5 backdrop-blur transition-colors hover:border-border hover:bg-background/70"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary shadow-[0_1px_2px_oklch(0.18_0.02_264/0.05)]">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 leading-relaxed">
                  <span className="font-semibold text-foreground">{title}</span>{' '}
                  <span className="text-sm text-muted-foreground">
                    {description}
                  </span>
                </div>
                <ArrowRight className="ml-auto size-3.5 shrink-0 self-center text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
