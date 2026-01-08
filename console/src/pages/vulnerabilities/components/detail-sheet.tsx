import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Image from '@/components/ui/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SeverityBadge } from '@/components/ui/severity-badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useVulnerabilitiesControllerGetVulnerabilityById } from '@/services/apis/gen/queries';
import { AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  BellOff,
  Check,
  Code,
  Copy,
  Cpu,
  ExternalLink,
  Info,
  Link as LinkIcon,
  Maximize2,
  Network,
  Shield,
  ShieldAlert,
  Tag,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface DetailSheetProps {
  vulId: string;
  open: boolean;
  setOpen: (value: boolean) => void;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  color: string;
}

function Section({ title, icon, children, color }: SectionProps) {
  return (
    <section>
      <h3 className={cn('font-bold flex items-center gap-2 mb-3', color)}>
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-6 px-2 shrink-0"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

export default function DetailSheet({
  vulId,
  open,
  setOpen,
}: DetailSheetProps) {
  const navigate = useNavigate();
  const { data, isLoading } =
    useVulnerabilitiesControllerGetVulnerabilityById(vulId);

  const handleViewDetail = () => {
    setOpen(false);
    navigate(`/vulnerabilities/${vulId}`);
  };

  if (!data && !isLoading) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className={cn(
          'flex flex-col w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[95%] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl',
          'shadow-xl p-5',
          'inset-y-0 right-0 fixed',
        )}
      >
        <SheetTitle className="sr-only">Vulnerability Details</SheetTitle>
        <SheetDescription className="sr-only">
          Detailed information about the vulnerability
        </SheetDescription>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                <p className="text-sm text-muted-foreground">
                  Loading details...
                </p>
              </div>
            </div>
          ) : (
            data && (
              <ScrollArea className="grow min-h-0 pr-2 sm:pr-4 mt-4 [&>div>div]:block!">
                <div className="flex flex-col space-y-5">
                  {/* General Information */}
                  <Section
                    title="General"
                    icon={
                      <AlertTriangle
                        size={20}
                        className="text-rose-600 dark:text-rose-400"
                      />
                    }
                    color="text-rose-600 dark:text-rose-400"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
                      <div className="md:col-span-2 flex items-center gap-2">
                        <span className="block mb-1">Name</span>
                        <span className="font-medium">{data.name}</span>
                        {data.vulnerabilityDismissal && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="secondary"
                                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 p-1"
                                >
                                  <BellOff size={14} />
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                <span>Dismissed</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      {/* <div>
												<span className="block mb-1">ID</span>
												<div className="flex items-center gap-2">
													<span className="font-mono text-sm">{data.id}</span>
													<CopyButton text={data.id} />
												</div>
											</div> */}
                      <div>
                        <span className="block mb-1">Severity</span>
                        <SeverityBadge severity={data.severity || 'info'} />
                      </div>
                      {data.cvssScore !== undefined &&
                        data.cvssScore !== null && (
                          <div>
                            <span className="block mb-1">CVSS Score</span>
                            <Badge variant="outline" className="font-bold">
                              {data.cvssScore.toFixed(1)}
                            </Badge>
                          </div>
                        )}
                      {data.epssScore !== undefined &&
                        data.epssScore !== null && (
                          <div>
                            <span className="block mb-1">EPSS Score</span>
                            <Badge variant="outline" className="font-bold">
                              {(data.epssScore * 100).toFixed(2)}%
                            </Badge>
                          </div>
                        )}
                      {data.vprScore !== undefined &&
                        data.vprScore !== null && (
                          <div>
                            <span className="block mb-1">VPR Score</span>
                            <Badge variant="outline" className="font-bold">
                              {data.vprScore.toFixed(1)}
                            </Badge>
                          </div>
                        )}
                      {data.synopsis && typeof data.synopsis === 'string' && (
                        <div className="md:col-span-2">
                          <span className="block mb-1">Synopsis</span>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {data.synopsis}
                          </p>
                        </div>
                      )}
                      {data.description && (
                        <div className="md:col-span-2">
                          <span className="block mb-1">Description</span>
                          <p className="text-sm leading-relaxed">
                            {data.description}
                          </p>
                        </div>
                      )}
                    </div>
                  </Section>

                  {data.tags &&
                    Array.isArray(data.tags) &&
                    data.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {data.tags.map((tag: string) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="flex items-center gap-1 h-8 rounded-md"
                          >
                            <Tag size={16} /> {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                  <Separator />

                  {/* Network Information */}
                  {(data.affectedUrl ||
                    data.ipAddress ||
                    data.host ||
                    (data.ports && data.ports.length > 0) ||
                    data.cvssMetric) && (
                    <>
                      <Section
                        title="Network & Metrics"
                        icon={
                          <Network
                            size={20}
                            className="text-cyan-600 dark:text-cyan-400"
                          />
                        }
                        color="text-cyan-600 dark:text-cyan-400"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
                          {data.affectedUrl && (
                            <div className="md:col-span-2">
                              <span className="block mb-1">Affected URL</span>
                              <div className="flex items-start gap-2">
                                <a
                                  href={data.affectedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:text-blue-600 hover:underline transition-colors break-all flex-1 min-w-0"
                                >
                                  {data.affectedUrl}
                                </a>
                                <CopyButton text={data.affectedUrl} />
                              </div>
                            </div>
                          )}
                          {data.host && (
                            <div className="md:col-span-2">
                              <span className="block mb-1">Host</span>
                              <div className="flex items-start gap-2">
                                <span className="font-mono text-sm break-all flex-1 min-w-0">
                                  {data.host}
                                </span>
                                <CopyButton text={data.host} />
                              </div>
                            </div>
                          )}
                          {data.ipAddress && (
                            <div>
                              <span className="block mb-1">IP Address</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm">
                                  {data.ipAddress}
                                </span>
                                <CopyButton text={data.ipAddress} />
                              </div>
                            </div>
                          )}
                          {data.ports &&
                            Array.isArray(data.ports) &&
                            data.ports.length > 0 && (
                              <div>
                                <span className="block mb-1">Ports</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {data.ports.map((port: string) => (
                                    <Badge
                                      key={port}
                                      variant="secondary"
                                      className="font-mono"
                                    >
                                      {port}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          {data.cvssMetric && (
                            <div className="md:col-span-2">
                              <span className="block mb-1">CVSS Vector</span>
                              <div className="flex items-center gap-2">
                                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                  {data.cvssMetric}
                                </code>
                                <CopyButton text={data.cvssMetric} />
                              </div>
                            </div>
                          )}
                        </div>
                      </Section>
                      <Separator />
                    </>
                  )}

                  {/* Identifiers */}
                  {(data.cveId ||
                    data.cweId ||
                    data.bidId ||
                    data.ceaId ||
                    data.iava) && (
                    <>
                      <Section
                        title="Identifiers"
                        icon={
                          <ShieldAlert
                            size={20}
                            className="text-pink-600 dark:text-pink-400"
                          />
                        }
                        color="text-pink-600 dark:text-pink-400"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
                          {data.cveId &&
                            Array.isArray(data.cveId) &&
                            data.cveId.length > 0 && (
                              <div>
                                <span className="block mb-1">CVE IDs</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {data.cveId.map((cve: string) => (
                                    <div
                                      key={cve}
                                      className="flex items-center gap-1"
                                    >
                                      <Badge
                                        variant="destructive"
                                        className="font-mono"
                                      >
                                        {cve}
                                      </Badge>
                                      <CopyButton text={cve} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          {data.cweId &&
                            Array.isArray(data.cweId) &&
                            data.cweId.length > 0 && (
                              <div>
                                <span className="block mb-1">CWE IDs</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {data.cweId.map((cwe: string) => (
                                    <Badge
                                      key={cwe}
                                      variant="outline"
                                      className="font-mono"
                                    >
                                      {cwe}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          {data.bidId &&
                            Array.isArray(data.bidId) &&
                            data.bidId.length > 0 && (
                              <div>
                                <span className="block mb-1">BID IDs</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {data.bidId.map((bid: string) => (
                                    <Badge
                                      key={bid}
                                      variant="outline"
                                      className="font-mono"
                                    >
                                      {bid}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          {data.ceaId &&
                            Array.isArray(data.ceaId) &&
                            data.ceaId.length > 0 && (
                              <div>
                                <span className="block mb-1">CEA IDs</span>
                                <div className="flex flex-wrap gap-2">
                                  {data.ceaId.map((cea: string) => (
                                    <Badge
                                      key={cea}
                                      variant="outline"
                                      className="font-mono"
                                    >
                                      {cea}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          {data.iava &&
                            Array.isArray(data.iava) &&
                            data.iava.length > 0 && (
                              <div>
                                <span className="block mb-1">IAVA</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {data.iava.map((iava: string) => (
                                    <Badge
                                      key={iava}
                                      variant="outline"
                                      className="font-mono"
                                    >
                                      {iava}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      </Section>
                      <Separator />
                    </>
                  )}

                  {/* References */}
                  {((data.references && data.references.length > 0) ||
                    data.cveUrl ||
                    data.cweUrl) && (
                    <>
                      <Section
                        title="References"
                        icon={
                          <LinkIcon
                            size={20}
                            className="text-teal-600 dark:text-teal-400"
                          />
                        }
                        color="text-teal-600 dark:text-teal-400"
                      >
                        <div className="space-y-2">
                          {data.cveUrl && (
                            <div>
                              <span className="block mb-1">CVE Reference</span>
                              <a
                                href={data.cveUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-600 hover:underline transition-colors text-sm break-all"
                              >
                                {data.cveUrl}
                              </a>
                            </div>
                          )}
                          {data.cweUrl && (
                            <div>
                              <span className="block mb-1">CWE Reference</span>
                              <a
                                href={data.cweUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-600 hover:underline transition-colors text-sm break-all"
                              >
                                {data.cweUrl}
                              </a>
                            </div>
                          )}
                          {data.references &&
                            Array.isArray(data.references) &&
                            data.references.length > 0 && (
                              <div>
                                <span className="block mb-1">
                                  Additional References
                                </span>
                                <div className="space-y-1">
                                  {data.references.map((ref: string) => (
                                    <a
                                      key={ref}
                                      href={ref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 hover:text-blue-600 hover:underline transition-colors text-sm break-all block"
                                    >
                                      {ref}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      </Section>
                      <Separator />
                    </>
                  )}

                  {/* Solution */}
                  {data.solution && (
                    <>
                      <Section
                        title="Solution"
                        icon={
                          <Shield
                            size={20}
                            className="text-emerald-600 dark:text-emerald-400"
                          />
                        }
                        color="text-emerald-600 dark:text-emerald-400"
                      >
                        <div className="relative font-mono rounded-xl p-4 shadow-lg border border-emerald-200 dark:border-emerald-800">
                          <pre className="whitespace-pre-wrap leading-relaxed text-sm">
                            {data.solution}
                          </pre>
                        </div>
                      </Section>
                      <Separator />
                    </>
                  )}

                  {/* Authors */}
                  {data.authors &&
                    Array.isArray(data.authors) &&
                    data.authors.length > 0 && (
                      <>
                        <Section
                          title="Authors"
                          icon={
                            <Users
                              size={20}
                              className="text-violet-600 dark:text-violet-400"
                            />
                          }
                          color="text-violet-600 dark:text-violet-400"
                        >
                          <div className="flex flex-wrap gap-2">
                            {data.authors.map((author: string) => (
                              <Badge
                                key={author}
                                variant="outline"
                                className="flex items-center gap-1 h-8 rounded-md"
                              >
                                <Users size={16} /> {author}
                              </Badge>
                            ))}
                          </div>
                        </Section>
                        <Separator />
                      </>
                    )}

                  {/* Extracted Results */}
                  {data.extractedResults &&
                    Array.isArray(data.extractedResults) &&
                    data.extractedResults.length > 0 && (
                      <>
                        <Section
                          title="Extracted Results"
                          icon={
                            <Code
                              size={20}
                              className="text-fuchsia-600 dark:text-fuchsia-400"
                            />
                          }
                          color="text-fuchsia-600 dark:text-fuchsia-400"
                        >
                          <div className="space-y-2">
                            {data.extractedResults.map((result: string) => (
                              <div
                                key={result}
                                className="font-mono text-xs bg-muted p-2 rounded border-l-2 border-fuchsia-500 break-all"
                              >
                                {result}
                              </div>
                            ))}
                          </div>
                        </Section>
                        <Separator />
                      </>
                    )}

                  {/* Metadata */}
                  <Section
                    title="Metadata"
                    icon={
                      <Info
                        size={20}
                        className="text-slate-700 dark:text-slate-300"
                      />
                    }
                    color="text-slate-700 dark:text-slate-300"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
                      {data.extractorName && (
                        <div>
                          <span className="block mb-1">Extractor</span>
                          <span>{data.extractorName}</span>
                        </div>
                      )}
                      <div>
                        <span className="block mb-1">Discovered</span>
                        <span>
                          {data.createdAt
                            ? new Date(data.createdAt).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Unknown'}
                        </span>
                      </div>
                      <div>
                        <span className="block mb-1">Last Updated</span>
                        <span>
                          {data.updatedAt
                            ? new Date(data.updatedAt).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Unknown'}
                        </span>
                      </div>
                      {data.publicationDate && (
                        <div>
                          <span className="block mb-1">Publication Date</span>
                          <span>
                            {new Date(data.publicationDate).toLocaleString(
                              'en-US',
                              {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              },
                            )}
                          </span>
                        </div>
                      )}
                      {data.modificationDate && (
                        <div>
                          <span className="block mb-1">Modification Date</span>
                          <span>
                            {new Date(data.modificationDate).toLocaleString(
                              'en-US',
                              {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              },
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* Tool Information */}
                  {data.tool && (
                    <>
                      <Separator />
                      <Section
                        title="Scanned By"
                        icon={
                          <Cpu
                            size={20}
                            className="text-blue-600 dark:text-blue-400"
                          />
                        }
                        color="text-blue-600 dark:text-blue-400"
                      >
                        <Link to={`/tools/${data.tool.id}`}>
                          <Button
                            variant="outline"
                            className="w-full justify-start gap-2 h-auto p-3 hover:bg-accent"
                          >
                            <Image
                              url={data.tool.logoUrl}
                              width={70}
                              height={70}
                              className="rounded-xl"
                            />
                            <div className="flex  items-center gap-3 flex-1 min-w-0">
                              <span className="font-semibold">
                                {data.tool.name.charAt(0).toUpperCase() +
                                  data.tool.name.slice(1)}
                              </span>
                              {/* {data.tool.description && (
                                <span className="text-xs text-muted-foreground line-clamp-1 w-full text-left">
                                  {data.tool.description}
                                </span>
                              )} */}
                              {data.tool.version && (
                                <Badge
                                  variant="secondary"
                                  className="mt-0.5 text-xs"
                                >
                                  v{data.tool.version}
                                </Badge>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 shrink-0" />
                          </Button>
                        </Link>
                      </Section>
                    </>
                  )}
                </div>
              </ScrollArea>
            )
          )}
        </AnimatePresence>

        {/* Footer with View Detail button */}
        <div className="pt-4 border-t mt-auto">
          <Button
            variant="default"
            onClick={handleViewDetail}
            className="w-full flex items-center justify-center gap-2"
          >
            <Maximize2 className="h-4 w-4" />
            View Full Page
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
