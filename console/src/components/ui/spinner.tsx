import { useT } from '@/lib/i18n-dictionary';
import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useT()
  return (
    <Loader2Icon
      role="status"
      aria-label={t('components.spinner.loading')}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
