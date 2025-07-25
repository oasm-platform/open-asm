import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils"; // Assuming this path is correct
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  ChartNoAxesGantt,
  Copy,
  EthernetPort,
  Globe,
  Layers,
  Lock,
  Network,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import AssetValue from "./components/asset-value"; // Assuming this path is correct
import BadgeList from "./components/badge-list"; // Assuming this path is correct
import HTTPXStatusCode from "./components/status-code"; // Assuming this path is correct

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

  // Calculate days left for SSL certificate
  const daysLeft = tls?.not_after
    ? Math.round(
        (new Date(tls.not_after).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : undefined;

  // Calculate certificate age start date and display
  const certAgeStartDate = tls?.not_before
    ? new Date(tls.not_before)
    : undefined;
  const certAgeDisplay = certAgeStartDate
    ? dayjs(certAgeStartDate).fromNow()
    : "N/A";

  // Handle copying HTTP header to clipboard
  const handleCopyHeader = async () => {
    if (httpx?.raw_header) {
      // Using document.execCommand('copy') for better compatibility in iframes
      const textarea = document.createElement("textarea");
      textarea.value = httpx.raw_header;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        toast.success("HTTP Response copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy text: ", err);
        toast.error("Failed to copy HTTP Response.");
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className={cn(
          "flex flex-col w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[95%] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl",
          "shadow-xl rounded-l-xl p-5",
          "inset-y-0 right-0 fixed",
        )}
      >
        <ScrollArea className="flex-grow min-h-0 pr-2 sm:pr-4 mt-4">
          <div className="flex flex-col">
            <section>
              <h3 className="font-bold text-blue-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Globe size={20} className="text-blue-500" />
                General
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
                <div>
                  <span className="block mb-1">Domain</span>
                  <AssetValue httpx={httpx} value={value} />
                </div>

                {/* IP Addresses */}
                {ipAddresses && ipAddresses.length > 0 ? (
                  <div>
                    <span className="block mb-1">IP Addresses</span>
                    <BadgeList list={ipAddresses} Icon={Network} />
                  </div>
                ) : (
                  <div>
                    <span className="block mb-1">IP Addresses</span>
                    <span className="italic">No IP addresses detected.</span>
                  </div>
                )}

                {httpx?.status_code && (
                  <div>
                    <span className="block mb-1">HTTP Status</span>
                    <HTTPXStatusCode httpx={httpx} />
                  </div>
                )}

                {daysLeft !== undefined && (
                  <div>
                    <span className="block mb-1">SSL Status</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "flex items-center gap-1 rounded-lg",
                        daysLeft < 0
                          ? "text-red-500 border-red-500"
                          : daysLeft < 30
                            ? "text-yellow-500 border-yellow-500"
                            : "text-green-500 border-green-500",
                      )}
                    >
                      <Lock size={16} /> SSL{" "}
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
                    <span className="block mb-1">Page Title</span>
                    <p className="  break-words">{httpx.title}</p>
                  </div>
                )}

                {httpx?.error && (
                  <div className="md:col-span-2">
                    <span className="block mb-1">Error</span>
                    <p className="text-red-600 dark:text-red-400 ">
                      {httpx.error}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <Separator className="my-5" />

            <section>
              <h3 className="font-bold text-indigo-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Network size={20} className="text-indigo-500" /> Network
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
                {tls?.host && (
                  <div>
                    <span className="block mb-1">Host</span>
                    <span className="">{tls.host}</span>
                  </div>
                )}
                {/* Port from TLS data, but presented in Network section */}
                {tls?.port && (
                  <div>
                    <span className="block mb-1">Port</span>
                    <span className="">{tls.port}</span>
                  </div>
                )}
                {ports && ports.length > 0 ? (
                  <div>
                    <span className="block mb-1">Open Ports</span>
                    <BadgeList
                      list={ports.sort((a: number, b: number) => a - b)}
                      Icon={EthernetPort}
                    />
                  </div>
                ) : (
                  <div>
                    <span className="block mb-1">Open Ports</span>
                    <span className="italic">No open ports detected.</span>
                  </div>
                )}
              </div>
            </section>

            {tls && (
              <>
                <Separator className="my-5" />
                <section>
                  <h3 className="font-bold text-green-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <ShieldCheck size={20} className="text-green-500" />{" "}
                    Certification
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
                    <div>
                      <span className="block mb-1">Issuer</span>
                      <div className="flex items-center gap-2">
                        <span className="">{tls.issuer_org[0]}</span>
                        {tls.issuer_org.length > 1 && (
                          <Badge className="text-gray-700 border-gray-300 dark:text-gray-300 dark:border-gray-600 rounded-md">
                            +{tls.issuer_org.length - 1}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block mb-1">Common Name</span>
                      <span className=" break-words">{tls.subject_cn}</span>
                    </div>

                    {/* Adjusted Alternate Names display logic */}
                    {tls.subject_an && tls.subject_an.length > 0 && (
                      <div>
                        <span className="block mb-1">Alternate Names</span>
                        <div className="flex items-center gap-2">
                          {tls.subject_an[1] &&
                            tls.subject_an[1] !== tls.subject_cn && (
                              <span className=" break-words">
                                {tls.subject_an[1]}
                              </span>
                            )}
                          {tls.subject_an.length > 2 && (
                            <Badge className="rounded-md">
                              +{tls.subject_an.length - 2}{" "}
                            </Badge>
                          )}
                          {tls.subject_an.length === 2 &&
                            !tls.subject_an[1] && (
                              <span className="italic">None</span>
                            )}
                        </div>
                      </div>
                    )}

                    {certAgeStartDate && (
                      <div>
                        <span className="block mb-1">Certificate Age</span>
                        <span className="">
                          {certAgeDisplay} (
                          {dayjs(tls.not_before).format("DD MMM, YYYY")})
                        </span>
                      </div>
                    )}
                    {daysLeft !== undefined && (
                      <div>
                        <span className="block mb-1">Expires On</span>
                        <span className="">
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
                <Separator className="my-5" />
                <section>
                  <h3 className="font-bold text-purple-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <Layers size={20} className="text-purple-500" />
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
                <Separator className="my-5" />
                <section className="pb-4">
                  <h3 className="font-bold  flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <ChartNoAxesGantt size={20} className="" />
                    HTTP Response
                  </h3>
                  <div className="relative font-mono rounded-xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-stone-800 **w-full**">
                    <pre className="whitespace-pre-wrap leading-relaxed **overflow-x-auto**">
                      {httpx.raw_header}
                      {/* {httpx?.body} */}
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

