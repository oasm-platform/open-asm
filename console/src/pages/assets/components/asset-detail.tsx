import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import {
  useAssetsControllerGetAssetById,
  type TechnologyDetailDTO,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import {
  ChartNoAxesGantt,
  Code,
  Globe,
  Layers,
  Loader2Icon,
  Lock,
  Network,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import AssetValue from './asset-value';
import { useScreenshotQueryOptions } from '@/hooks/use-screenshot-query-options';
import AddTagDialog from './add-tag-dialog';
import BadgeList from './badge-list';
import ScreenshotCell from './screenshot-cell';
import HTTPXStatusCode from './status-code';
import { TechnologyTooltip } from './technology-tooltip';
import ViewCode from './view-code';
import { asTlsInfo } from '../tls-info';

export default function AssetDetail({ id }: { id: string }) {
  const t = useT();
  const screenshotOptions = useScreenshotQueryOptions();
  const { data, refetch } = useAssetsControllerGetAssetById(id, {
    query: { ...screenshotOptions },
  });

  if (!data) {
    return (
      <div className="h-full w-full flex justify-center items-center">
        <Loader2Icon className="animate-spin mr-1 h-10 w-10" />
      </div>
    );
  }

  const { value, httpResponses, ipAddresses, tags } = data;
  const tls = asTlsInfo(httpResponses?.tls);

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
    : t('assets.detail.notAvailable');

  return (
    <ScrollArea className="grow min-h-0 pr-2 sm:pr-4 mt-4 [&>div>div]:block!">
      <div className="flex flex-col">
        <section>
          <h3 className="font-bold text-blue-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Globe size={20} className="text-blue-500" />
            {t('assets.detail.general')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
            <div className="space-y-4">
              <div>
                <span className="block mb-1">{t('assets.detail.domain')}</span>
                <AssetValue httpResponse={httpResponses} value={value} />
              </div>
              {httpResponses?.status_code && (
                <div>
                  <span className="block mb-1">{t('assets.detail.httpStatus')}</span>
                  <HTTPXStatusCode httpResponse={httpResponses} />
                </div>
              )}
            </div>
            <ScreenshotCell asset={data} />
            {/* IP Addresses */}
            {ipAddresses && ipAddresses.length > 0 ? (
              <div>
                <span className="block mb-1">{t('assets.detail.ipAddresses')}</span>
                <BadgeList list={ipAddresses} Icon={Network} />
              </div>
            ) : (
              <div>
                <span className="block mb-1">{t('assets.detail.ipAddresses')}</span>
                <span className="italic">{t('assets.detail.noIpAddresses')}</span>
              </div>
            )}
            {daysLeft !== undefined && (
              <div>
                <span className="block mb-1">{t('assets.detail.sslStatus')}</span>
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
                    ? t('assets.tls.expired')
                    : daysLeft < 30
                      ? t('assets.detail.expiringSoon')
                      : t('assets.detail.valid')}
                </Badge>
              </div>
            )}

            {httpResponses?.title && (
              <div className="md:col-span-2">
                <span className="block mb-1">{t('assets.detail.pageTitle')}</span>
                <p className="wrap-break-word">{httpResponses.title}</p>
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-wrap gap-2 mt-4">
          {(tags ?? []).map((tag) => (
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

        {tls && (
          <section>
            <Separator className="my-5" />
            <h3 className="font-bold text-indigo-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <Network size={20} className="text-indigo-500" /> {t('assets.detail.network')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
              {tls?.host && (
                <div>
                  <span className="block mb-1">{t('assets.detail.host')}</span>
                  <span className="">{tls.host}</span>
                </div>
              )}
              {/* Port from TLS data, but presented in Network section */}
              {tls?.port && (
                <div>
                  <span className="block mb-1">{t('assets.detail.port')}</span>
                  <span className="">{tls.port}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {tls && (
          <>
            <Separator className="my-5" />
            <section>
              <h3 className="font-bold text-green-500 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <ShieldCheck size={20} className="text-green-500" />{' '}
                {t('assets.detail.certification')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 sm:gap-x-8">
                <div>
                  <span className="block mb-1">{t('assets.detail.issuer')}</span>
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
                  <span className="block mb-1">{t('assets.detail.commonName')}</span>
                  <span className=" break-words">{tls.subject_cn}</span>
                </div>

                {/* Adjusted Alternate Names display logic */}
                {tls.subject_an && tls.subject_an.length > 1 && (
                  <div>
                    <span className="block mb-1">{t('assets.detail.alternateNames')}</span>
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
                        <span className="italic">{t('common.none')}</span>
                      )}
                    </div>
                  </div>
                )}

                {certAgeStartDate && (
                  <div>
                    <span className="block mb-1">{t('assets.detail.certificateAge')}</span>
                    <span className="">
                      {certAgeDisplay} (
                      {dayjs(tls.not_before).format('DD MMM, YYYY')})
                    </span>
                  </div>
                )}
                {daysLeft !== undefined && (
                  <div>
                    <span className="block mb-1">{t('assets.detail.expiresOn')}</span>
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
                          ? t('assets.detail.daysAgo', { count: Math.abs(daysLeft) })
                          : t('assets.detail.daysLeft', { count: daysLeft })}
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
                {t('assets.detail.technologies')}
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
                {t('assets.detail.httpResponse')}
              </h3>
              <ViewCode code={httpResponses.raw_header} />
            </section>
          </>
        )}
        {!!httpResponses?.body && (
          <>
            <section className="pb-4">
              <h3 className="font-bold  flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Code size={20} className="" />
                {t('assets.detail.body')}
              </h3>
              <ViewCode code={httpResponses.body} />
            </section>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
