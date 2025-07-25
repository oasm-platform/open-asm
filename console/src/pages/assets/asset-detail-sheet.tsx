import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  EthernetPort,
  Globe,
  Network,
  Lock,
  ShieldCheck,
  ChartNoAxesGantt,
  Copy,
  Layers,
} from "lucide-react";
import AssetValue from "./components/asset-value";
import { cn } from "@/lib/utils";
import HTTPXStatusCode from "./components/status-code";
import BadgeList from "./components/badge-list";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  currentRow: any;
}

export default function AssetDetailSheet({ open, setOpen, currentRow }: Props) {
  if (!currentRow) {
    return null;
  }

  const { value, metadata, dnsRecords } = currentRow;
  const httpx = metadata?.httpx;
  const ports = metadata?.ports;
  const ipAddresses = dnsRecords?.["A"];
  const tls = httpx?.tls;

  const daysLeft = tls?.not_after
    ? Math.round(
        (new Date(tls.not_after).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : undefined;

  const certAgeStartDate = tls?.not_before
    ? new Date(tls.not_before)
    : undefined;
  const certAgeDisplay = certAgeStartDate
    ? dayjs(certAgeStartDate).fromNow()
    : "N/A";

  const handleCopyHeader = async () => {
    if (httpx?.raw_header) {
      await navigator.clipboard.writeText(httpx.raw_header);
      toast.success("HTTP Response copied to clipboard!");
    }
  };

  const primaryAlternateNames = tls?.subject_an ? [tls.subject_an[1]] : []; // Display the first alternate name after CN
  const remainingAlternateNamesCount = tls?.subject_an
    ? tls.subject_an.length - 2
    : 0; // Count remaining after CN and the first one displayed

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className={cn(
          "flex flex-col w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[95%] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl",
          "bg-white dark:bg-gray-900 shadow-xl rounded-l-xl p-4 sm:p-6 md:p-8",
          "inset-y-0 right-0 fixed",
        )}
      >
        <SheetHeader className="pb-4 sm:pb-6 border-b border-gray-200 dark:border-gray-700">
          <SheetTitle className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 dark:text-gray-50 tracking-tight leading-tight">
            {value}
          </SheetTitle>
          <SheetDescription className="text-base sm:text-lg text-gray-600 dark:text-gray-400 mt-1">
            All details about this asset.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-grow min-h-0 pr-2 sm:pr-4 mt-4">
          <div className="flex flex-col gap-6 sm:gap-8 text-base">
            <section>
              <h3 className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Globe size={22} className="text-blue-600 dark:text-blue-300" />{" "}
                General
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
                <div>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                    Domain
                  </span>
                  <AssetValue httpx={httpx} value={value} />
                </div>

                {/* IP Addresses */}
                {ipAddresses && ipAddresses.length > 0 ? (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      IP Addresses
                    </span>
                    <BadgeList list={ipAddresses} Icon={Network} />
                  </div>
                ) : (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      IP Addresses
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 italic">
                      No IP addresses detected.
                    </span>
                  </div>
                )}

                {httpx?.status_code && (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      HTTP Status
                    </span>
                    <HTTPXStatusCode httpx={httpx} />
                  </div>
                )}

                {daysLeft !== undefined && (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      SSL Status
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-8 sm:h-9 px-3 sm:px-4 py-1 flex items-center gap-2 text-sm sm:text-base font-semibold rounded-lg",
                        daysLeft < 0
                          ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-600"
                          : daysLeft < 30
                            ? "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-600"
                            : "bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-600",
                      )}
                    >
                      <Lock size={18} /> SSL{" "}
                      {daysLeft < 0
                        ? "Expired"
                        : daysLeft < 30
                          ? "Expiring Soon"
                          : "Valid"}
                    </Badge>
                  </div>
                )}

                {httpx?.title && (
                  <div className="md:col-span-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      Page Title
                    </span>
                    <p className="font-semibold text-gray-800 dark:text-gray-200 break-words text-base sm:text-lg">
                      {httpx.title}
                    </p>
                  </div>
                )}

                {httpx?.error && (
                  <div className="md:col-span-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      Error
                    </span>
                    <p className="text-red-600 dark:text-red-400 font-semibold text-base sm:text-lg">
                      {httpx.error}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <Separator className="bg-gray-200 dark:bg-gray-700 my-4 sm:my-6" />

            <section>
              <h3 className="text-xl sm:text-2xl font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Network
                  size={22}
                  className="text-indigo-600 dark:text-indigo-300"
                />{" "}
                Network
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
                {tls?.host && (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      Host
                    </span>
                    <span className="font-bold text-gray-800 dark:text-gray-200 text-base sm:text-lg">
                      {tls.host}
                    </span>
                  </div>
                )}
                {/* Port from TLS data, but presented in Network section */}
                {tls?.port && (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      Port
                    </span>
                    <span className="font-bold text-gray-800 dark:text-gray-200 text-base sm:text-lg">
                      {tls.port}
                    </span>
                  </div>
                )}
                {ports && ports.length > 0 ? (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      Open Ports
                    </span>
                    <BadgeList
                      list={ports.sort((a: number, b: number) => a - b)}
                      Icon={EthernetPort}
                    />
                  </div>
                ) : (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                      Open Ports
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 italic">
                      No open ports detected.
                    </span>
                  </div>
                )}
              </div>
            </section>

            {tls && (
              <>
                <Separator className="bg-gray-200 dark:bg-gray-700 my-4 sm:my-6" />
                <section>
                  <h3 className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-400 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <ShieldCheck
                      size={22}
                      className="text-green-600 dark:text-green-300"
                    />{" "}
                    Certification
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                        Issuer
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800 dark:text-gray-200 text-base sm:text-lg">
                          {tls.issuer_org[0]}
                        </span>
                        {tls.issuer_org.length > 1 && (
                          <Badge className="bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 rounded-md text-xs sm:text-sm">
                            +{tls.issuer_org.length - 1}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                        Common Name
                      </span>
                      <span className="font-bold text-gray-800 dark:text-gray-200 break-words text-base sm:text-lg">
                        {tls.subject_cn}
                      </span>
                    </div>

                    {/* Adjusted Alternate Names display logic */}
                    {tls.subject_an && tls.subject_an.length > 0 && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                          Alternate Names
                        </span>
                        <div className="flex items-center gap-2">
                          {tls.subject_an[1] &&
                            tls.subject_an[1] !== tls.subject_cn && (
                              <span className="font-bold text-gray-800 dark:text-gray-200 break-words text-base sm:text-lg">
                                {tls.subject_an[1]}
                              </span>
                            )}
                          {tls.subject_an.length > 2 && (
                            <Badge className="bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 rounded-md text-xs sm:text-sm">
                              +{tls.subject_an.length - 2}{" "}
                            </Badge>
                          )}
                          {tls.subject_an.length === 2 &&
                            !tls.subject_an[1] && (
                              <span className="text-gray-600 dark:text-gray-400 italic">
                                None
                              </span>
                            )}
                        </div>
                      </div>
                    )}

                    {certAgeStartDate && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                          Certificate Age
                        </span>
                        <span className="font-bold text-gray-800 dark:text-gray-200 text-base sm:text-lg">
                          {certAgeDisplay} (
                          {dayjs(tls.not_before).format("DD MMM, YYYY")})
                        </span>
                      </div>
                    )}
                    {daysLeft !== undefined && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold block mb-1">
                          Expires On
                        </span>
                        <span className="font-bold text-gray-800 dark:text-gray-200 text-base sm:text-lg">
                          {dayjs(tls.not_after).format("DD MMM, YYYY")}{" "}
                          <span
                            className={cn(
                              daysLeft < 0
                                ? "text-red-500"
                                : daysLeft < 30
                                  ? "text-yellow-500"
                                  : "text-green-500",
                            )}
                          >
                            (
                            {daysLeft < 0
                              ? Math.abs(daysLeft) + " days ago"
                              : daysLeft + " days left"}
                            )
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            {!!httpx?.tech && httpx.tech.length > 0 && (
              <>
                <Separator className="bg-gray-200 dark:bg-gray-700 my-4 sm:my-6" />
                <section>
                  <h3 className="text-xl sm:text-2xl font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <Layers
                      size={22}
                      className="text-purple-600 dark:text-purple-300"
                    />{" "}
                    Technologies
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <BadgeList list={httpx.tech} />
                  </div>
                </section>
              </>
            )}

            {!!httpx?.raw_header && (
              <>
                <Separator className="bg-gray-200 dark:bg-gray-700 my-4 sm:my-6" />
                <section className="pb-4">
                  <h3 className="text-xl sm:text-2xl font-bold text-red-700 dark:text-red-400 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <ChartNoAxesGantt
                      size={22}
                      className="text-red-600 dark:text-red-300"
                    />{" "}
                    HTTP Response
                  </h3>
                  <div className="relative bg-gray-950 text-gray-100 font-mono rounded-xl p-4 sm:p-6 text-sm shadow-lg overflow-x-auto border border-gray-700">
                    <pre className="whitespace-pre-wrap leading-relaxed text-xs sm:text-[0.875rem]">
                      {httpx.raw_header}
                    </pre>
                    <Button
                      onClick={handleCopyHeader}
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 sm:top-3 sm:right-3 text-gray-400 hover:text-gray-50 hover:bg-gray-800 transition-colors duration-200 rounded-lg p-0.5 sm:p-1"
                    >
                      <Copy size={14} />
                    </Button>
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
