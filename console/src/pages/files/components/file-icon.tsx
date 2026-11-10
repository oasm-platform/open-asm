import { cn } from '@/lib/utils';
import {
  File,
  FileArchive,
  FileBraces,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Folder,
  type LucideIcon,
} from 'lucide-react';

interface FileKind {
  icon: LucideIcon;
  color: string;
}

const KINDS = {
  image: { icon: FileImage, color: 'text-rose-500' },
  video: { icon: FileVideoCamera, color: 'text-violet-500' },
  audio: { icon: FileMusic, color: 'text-pink-500' },
  pdf: { icon: FileText, color: 'text-red-600' },
  sheet: { icon: FileSpreadsheet, color: 'text-emerald-600' },
  archive: { icon: FileArchive, color: 'text-amber-600' },
  data: { icon: FileBraces, color: 'text-sky-600' },
  code: { icon: FileCode, color: 'text-indigo-500' },
  text: { icon: FileText, color: 'text-blue-500' },
  other: { icon: File, color: 'text-muted-foreground' },
} satisfies Record<string, FileKind>;

const BY_EXTENSION: Record<string, keyof typeof KINDS> = {
  pdf: 'pdf',
  csv: 'sheet',
  tsv: 'sheet',
  xls: 'sheet',
  xlsx: 'sheet',
  zip: 'archive',
  gz: 'archive',
  tgz: 'archive',
  tar: 'archive',
  '7z': 'archive',
  rar: 'archive',
  json: 'data',
  jsonl: 'data',
  yaml: 'data',
  yml: 'data',
  xml: 'data',
  toml: 'data',
  js: 'code',
  ts: 'code',
  py: 'code',
  go: 'code',
  sh: 'code',
  html: 'code',
  css: 'code',
  sql: 'code',
  md: 'text',
  txt: 'text',
  log: 'text',
  doc: 'text',
  docx: 'text',
};

/** Picks an icon from the extension first (agents often save as text/plain), then the MIME type. */
export function fileKind(name: string, mimeType = ''): FileKind {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const byExt = BY_EXTENSION[ext];
  if (byExt) return KINDS[byExt];
  const [type] = mimeType.split('/');
  if (type === 'image' || type === 'video' || type === 'audio')
    return KINDS[type];
  if (type === 'text') return KINDS.text;
  return KINDS.other;
}

export function FileIcon({
  name,
  mimeType,
  className,
}: {
  name: string;
  mimeType?: string;
  className?: string;
}) {
  const { icon: Icon, color } = fileKind(name, mimeType);
  return <Icon className={cn('shrink-0', color, className)} />;
}

export function FolderIcon({ className }: { className?: string }) {
  return (
    <Folder
      className={cn('shrink-0 fill-amber-400 text-amber-500', className)}
    />
  );
}
