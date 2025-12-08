import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useAssetsControllerGetAssetById,
  type TechnologyDetailDTO,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import {
  ChartNoAxesGantt,
  Copy,
  Globe,
  Layers,
  Loader2Icon,
  Lock,
  Network,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import AssetValue from './asset-value';
import BadgeList from './badge-list';
import HTTPXStatusCode from './status-code';
import { TechnologyTooltip } from './technology-tooltip';
import AddTagDialog from './add-tag-dialog';

export default function AssetDetail({ id }: { id: string }) {
  const { data, refetch } = useAssetsControllerGetAssetById(id, {});

  if (!data) {
    return (
      <div className="h-full w-full flex justify-center items-center">
        <Loader2Icon className="animate-spin mr-1 h-10 w-10" />
      </div>
    );
  }

  const { value, httpResponses, ipAddresses, tags } = data;
  const tls = httpResponses?.tls;

  // Calculate days left for SSL certificate
  const daysLeft = tls?.not_after
    ? Math.round(
        (new Date(tls.not_after as unknown as Date).getTime() -
          new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : undefined;

  // Calculate certificate age start date and display
  const certAgeStartDate = tls?.not_before
    ? new Date(tls.not_before as unknown as Date)
    : undefined;
  const certAgeDisplay = certAgeStartDate
    ? dayjs(certAgeStartDate).fromNow()
    : 'N/A';

  const handleCopyHeader = async () => {
    await navigator.clipboard.writeText(httpResponses?.raw_header ?? '');
    toast.success('HTTP response copied to clipboard');
  };

  return (
    <ScrollArea className="flex-grow min-h-0 pr-2 sm:pr-4 mt-4 [&>div>div]:!block">
      <div className="flex flex-col">
        <section>
          <h3 className="font-bold text-blue-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Globe size={20} className="text-blue-500" />
            General
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
            <div>
              <span className="block mb-1">Domain</span>
              <AssetValue httpResponse={httpResponses} value={value} />
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

            {httpResponses?.status_code && (
              <div>
                <span className="block mb-1">HTTP Status</span>
                <HTTPXStatusCode httpResponse={httpResponses} />
              </div>
            )}

            {daysLeft !== undefined && (
              <div>
                <span className="block mb-1">SSL Status</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'flex items-center gap-1 rounded-lg',
                    daysLeft < 0
                      ? 'text-red-500 border-red-500'
                      : daysLeft < 30
                        ? 'text-yellow-500 border-yellow-500'
                        : 'text-green-500 border-green-500',
                  )}
                >
                  <Lock size={16} /> SSL{' '}
                  {daysLeft < 0
                    ? 'Expired'
                    : daysLeft < 30
                      ? 'Expiring Soon'
                      : 'Valid'}
                </Badge>
              </div>
            )}

            {httpResponses?.title && (
              <div className="md:col-span-2">
                <span className="block mb-1">Page Title</span>
                <p className="  break-words">{httpResponses.title}</p>
              </div>
            )}
          </div>
        </section>
        <div className="flex flex-wrap gap-2 mt-4">
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              className="flex items-center gap-1 h-8 rounded-md"
            >
              <Tag size={16} /> {tag.tag}
            </Badge>
          ))}
          <AddTagDialog id={id} tags={tags} refetch={refetch} />
        </div>
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
          </div>
        </section>

        {tls && (
          <>
            <Separator className="my-5" />
            <section>
              <h3 className="font-bold text-green-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <ShieldCheck size={20} className="text-green-500" />{' '}
                Certification
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
                <div>
                  <span className="block mb-1">Issuer</span>
                  <div className="flex items-center gap-2">
                    <span className="">{tls?.issuer_org?.[0]}</span>
                    {tls?.issuer_org?.length > 1 && (
                      <Badge className="text-gray-700 border-gray-300 dark:text-gray-300 dark:border-gray-600 rounded-md">
                        +{tls?.issuer_org?.length - 1}
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <span className="block mb-1">Common Name</span>
                  <span className=" break-words">{tls.subject_cn}</span>
                </div>

                {/* Adjusted Alternate Names display logic */}
                {tls.subject_an && tls.subject_an.length > 1 && (
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
                          +{tls.subject_an.length - 2}{' '}
                        </Badge>
                      )}
                      {tls.subject_an.length === 2 && !tls.subject_an[1] && (
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
                      {dayjs(tls.not_before).format('DD MMM, YYYY')})
                    </span>
                  </div>
                )}
                {daysLeft !== undefined && (
                  <div>
                    <span className="block mb-1">Expires On</span>
                    <span className="">
                      {dayjs(tls.not_after).format('DD MMM, YYYY')}{' '}
                      <span
                        className={cn(
                          daysLeft < 0
                            ? 'text-red-500'
                            : daysLeft < 30
                              ? 'text-yellow-500'
                              : 'text-green-500',
                        )}
                      >
                        (
                        {daysLeft < 0
                          ? Math.abs(daysLeft) + ' days ago'
                          : daysLeft + ' days left'}
                        )
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {!!httpResponses?.techList && httpResponses.techList.length > 0 && (
          <>
            <Separator className="my-5" />
            <section>
              <h3 className="font-bold text-purple-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Layers size={20} className="text-purple-500" />
                Technologies
              </h3>
              <div className="flex flex-wrap gap-2">
                {(
                  httpResponses.techList as unknown as TechnologyDetailDTO[]
                ).map(
                  (item) =>
                    item.name && (
                      <TechnologyTooltip tech={item} key={item.name} />
                    ),
                )}
              </div>
            </section>
          </>
        )}

        {!!httpResponses?.raw_header && (
          <>
            <Separator className="my-5" />
            <section className="pb-4">
              <h3 className="font-bold  flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <ChartNoAxesGantt size={20} className="" />
                HTTP Response
              </h3>
              <div className="relative font-mono rounded-xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-stone-800 **w-full**">
                <pre className="whitespace-pre-wrap leading-relaxed **overflow-x-auto**">
                  {httpResponses.raw_header}
                  {/* {http_probe?.body} */}
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
  );
}
