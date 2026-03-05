import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

interface ViewCodeProps {
  code: string;
}
export default function ViewCode({ code }: ViewCodeProps) {
  const handleCopyHeader = async () => {
    await navigator.clipboard.writeText(code ?? '');
    toast.success('Copied to clipboard');
  };
  return (
    <div className="relative font-mono rounded-xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-stone-800 **w-full**">
      <pre className="whitespace-pre-wrap leading-relaxed **overflow-x-auto**">
        {code}
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
  );
}
