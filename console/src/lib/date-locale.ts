import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/es';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/ru';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh-cn';
import type { Locale } from 'date-fns';
import { enUS, es, it, ja, ko, ru, vi, zhCN } from 'date-fns/locale';
import { getLanguage, subscribeLanguage } from '@/utils/languageState';

const DAYJS: Record<string, string> = { zh: 'zh-cn' };
const DATE_FNS: Record<string, Locale> = { es, it, ja, ko, ru, vi, zh: zhCN };

/** date-fns locale of the UI language, for `formatDistanceToNow` & co. */
export const dateFnsLocale = (): Locale => DATE_FNS[getLanguage()] ?? enUS;

// dayjs keeps one global locale: follow the UI language ("9 giờ trước")
dayjs.extend(relativeTime);
const apply = () => dayjs.locale(DAYJS[getLanguage()] ?? getLanguage());
apply();
subscribeLanguage(apply);
