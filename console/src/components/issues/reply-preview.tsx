import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Reply } from 'lucide-react';
import { type IssueComment } from '@/services/apis/gen/queries';

interface ReplyPreviewProps {
  repliedComment: NonNullable<IssueComment['repComment']>;
}

export const ReplyPreview = ({ repliedComment }: ReplyPreviewProps) => {
  return (
    <div className="mb-4 border border-border/60 rounded bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 border-b border-border/40 text-[11px] text-muted-foreground">
        <Reply className="h-3 w-3" />
        <span className="font-semibold text-foreground/80">
          {repliedComment.createdBy?.name || 'Unknown'}
        </span>
      </div>
      <div className="p-2.5 text-[13px] text-muted-foreground/80 italic overflow-hidden relative max-h-[4.5rem]">
        <div className="line-clamp-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Render block elements as fragments/spans to keep text flow flat in preview
              p: ({ ...props }) => <span {...props} />,
              h1: ({ ...props }) => <span className="font-bold" {...props} />,
              h2: ({ ...props }) => <span className="font-bold" {...props} />,
              h3: ({ ...props }) => <span className="font-bold" {...props} />,
              h4: ({ ...props }) => <span className="font-bold" {...props} />,
              ul: ({ ...props }) => <span className="ml-2" {...props} />,
              ol: ({ ...props }) => <span className="ml-2" {...props} />,
              li: ({ ...props }) => <span className="mr-2" {...props} />,
            }}
          >
            {repliedComment.content}
          </ReactMarkdown>
        </div>
        {/* Subtle fade to indicate more content if it's long */}
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-muted/20 to-transparent pointer-events-none" />
      </div>
    </div>
  );
};
