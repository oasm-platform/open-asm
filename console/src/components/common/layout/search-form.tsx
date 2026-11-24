import { useT } from '@/lib/i18n-dictionary';
import { Search } from "lucide-react"

import { Label } from "@/components/ui/label"
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarInput,
} from "@/components/ui/sidebar"

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
    const t = useT()
    return (
        <form {...props}>
            <SidebarGroup className="py-0">
                <SidebarGroupContent className="relative">
                    <Label htmlFor="search" className="sr-only">
                        {t('common.search')}
                    </Label>
                    <SidebarInput
                        id="search"
                        placeholder={t('shell.search.placeholder')}
                        className="pl-8"
                    />
                    <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
                </SidebarGroupContent>
            </SidebarGroup>
        </form>
    )
}
