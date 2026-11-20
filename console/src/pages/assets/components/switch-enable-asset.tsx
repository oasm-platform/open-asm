import { Switch } from '@/components/ui/switch';
import { useAssetsControllerToggleAsset } from '@/services/apis/gen/queries';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';

export default function SwitchEnableAsset({
    id,
    currentStatus,
    onUpdate,
}: {
    id: string;
    currentStatus: boolean,
    onUpdate?: () => void;
}) {
  const t = useT();
    const [isEnabled, setIsEnabled] = useState(currentStatus);
    const { mutate: toggleAsset, isPending } = useAssetsControllerToggleAsset();

    useEffect(() => {
        setIsEnabled(currentStatus);
    }, [currentStatus])
    const handleChange = (checked: boolean) => {
        setIsEnabled(checked);
        if (onUpdate) {
            onUpdate();
        }
        toggleAsset({
            data: {
                assetId: id,
                isEnabled: checked,
            }
        }, {
            onSuccess: () => {
                setIsEnabled(checked);
                toast.success(t('assets.toggle.updated'));
            },
            onError: () => {
                setIsEnabled(!checked);
                toast.error(t('assets.toggle.updateFailed'));
            }
        });
    };

    return (
        <Switch
            disabled={isPending}
            checked={isEnabled}
            onCheckedChange={handleChange}
            aria-label="controlled"
            onClick={(event) => event.stopPropagation()}
        />
    );
}