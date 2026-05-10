import AppLogo from '@/components/ui/app-logo';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex h-screen">
      <div className="absolute top-6 left-6">
        <AppLogo type="large" />
      </div>
      {children}
      <div className="hidden lg:flex lg:w-1/2 from-primary/20 to-primary/5 items-center justify-center p-12">
        <div className="max-w-lg space-y-11 pt-4">
          <div className="flex items-center gap-4">
            <span className="text-lg text-foreground/80">
              <b>Discover</b> and manage assets with auto-grouping and
              multi-workspace support
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg text-foreground/80">
              <b>Scan</b> vulnerabilities and misconfigs with issue tracking and
              risk analysis
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg text-foreground/80">
              <b>Identify</b> technologies and services on discovered assets
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg text-foreground/80">
              <b>High-performance</b> distributed scanning engine
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg text-foreground/80">
              <b>Automated</b> schedules, alerts, and remediation workflows
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg text-foreground/80">
              <b>AI Agent</b> natural language queries and automated remediation
              guidance
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg text-foreground/80">
              <b>Real-time</b> monitoring with instant notifications
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg text-foreground/80">
              <b>Risk trends</b> analytics and detailed reporting
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
