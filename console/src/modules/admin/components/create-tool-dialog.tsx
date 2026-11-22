import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToolCategory, useAdminControllerCreateTool } from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { type TFunction, useT } from '@/lib/i18n-dictionary';

const createFormSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, t('admin.createTool.nameRequired')),
    description: z.string().min(1, t('admin.createTool.descriptionRequired')),
    category: z.nativeEnum(ToolCategory),
    version: z.string().min(1, t('admin.createTool.versionRequired')),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface CreateToolDialogProps {
    providerId: string;
    children?: React.ReactNode;
}

export function CreateToolDialog({ providerId, children }: CreateToolDialogProps) {
    const t = useT();
    const formSchema = React.useMemo(() => createFormSchema(t), [t]);
    const [open, setOpen] = React.useState(false);
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            description: '',
            category: ToolCategory.subdomains,
            version: '',
        },
    });

    const { mutate: createTool, isPending } = useAdminControllerCreateTool();

    const onSubmit = (values: FormValues) => {
        createTool(
            {
                data: {
                    name: values.name,
                    description: values.description,
                    version: values.version,
                    // Provider tools run in one category.
                    categories: [values.category],
                    providerId
                },
            },
            {
                onSuccess: () => {
                    setOpen(false);
                    form.reset();
                },
                onError: () => {
                    toast(t('admin.createTool.failed'));
                },
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || <Button variant="default">{t('admin.createTool.open')}</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('admin.createTool.title')}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('admin.createTool.name')}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('admin.createTool.namePlaceholder')} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('admin.createTool.description')}</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder={t('admin.createTool.descriptionPlaceholder')} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="category"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('admin.createTool.category')}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder={t('admin.createTool.categoryPlaceholder')} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(ToolCategory).map((category) => (
                                                <SelectItem key={category} value={category}>
                                                    {category.replace('_', ' ').replace(/^(.)/, (_, c) => c.toUpperCase())}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="version"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('admin.createTool.version')}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('admin.createTool.versionPlaceholder')} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end space-x-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={isPending}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? t('admin.createTool.creating') : t('common.create')}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}