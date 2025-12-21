import { Markdown } from '../common/markdown';

interface CommentContentProps {
  content: string;
}

export const CommentContent = ({ content }: CommentContentProps) => {
  return (
    <div className="leading-relaxed mb-0">
      <Markdown content={content} />
    </div>
  );
};
