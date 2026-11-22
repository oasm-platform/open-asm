import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n-dictionary';
import {
  DismissReason,
  useVulnerabilitiesControllerBulkDismissVulnerabilities,
  useVulnerabilitiesControllerGetSettings,
} from '@/services/apis/gen/queries';
import { addDays, format, parse, startOfDay } from 'date-fns';
import {
  DATE_FORMAT,
  DEFAULT_RISK_ACCEPT_MAX_DAYS,
  validateRiskExpiry,
} from '../risk-expiry';
import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

/** Available reasons for dismissing a vulnerability */
const DISMISS_REASONS = [
  {
    value: DismissReason.false_positive,
    labelKey: 'vulnerabilities.dismissReason.falsePositive',
    descriptionKey: 'vulnerabilities.dismiss.falsePositiveDesc',
  },
  {
    value: DismissReason.used_in_test,
    labelKey: 'vulnerabilities.dismissReason.usedInTest',
    descriptionKey: 'vulnerabilities.dismiss.usedInTestDesc',
  },
  {
    value: DismissReason.wont_fix,
    labelKey: 'vulnerabilities.dismissReason.wontFix',
    descriptionKey: 'vulnerabilities.dismiss.wontFixDesc',
  },
  {
    value: DismissReason.risk_accepted,
    labelKey: 'vulnerabilities.dismissReason.riskAccepted',
    descriptionKey: 'vulnerabilities.dismiss.riskAcceptedDesc',
  },
] as const;

interface DismissAlertDialogProps {
  /** Vulnerability ids to dismiss */
  vulnerabilityIds: string[];
  /** Display name for the vulnerability(s) being dismissed */
  vulnerabilityName?: string;
  /** Trigger element that opens the dialog */
  trigger: ReactNode;
  /** Callback invoked after successful dismissal */
  onDismissSuccess?: () => void;
  /** 'accept-risk' opens with risk accepted chosen and titles the dialog for it. */
  mode?: 'dismiss' | 'accept-risk';
}

/**
 * Dialog for dismissing vulnerabilities: a reason, an optional comment and,
 * for a risk acceptance, the date it ends (at most riskAcceptMaxDays ahead).
 */
export function DismissAlertDialog({
  vulnerabilityIds,
  vulnerabilityName,
  trigger,
  onDismissSuccess,
  mode = 'dismiss',
}: DismissAlertDialogProps) {
  const t = useT();
  const initialReason: DismissReason | '' =
    mode === 'accept-risk' ? DismissReason.risk_accepted : '';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DismissReason | ''>(initialReason);
  const [comment, setComment] = useState('');
  const [expiry, setExpiry] = useState('');
  const [touched, setTouched] = useState(false);

  const { data: settings } = useVulnerabilitiesControllerGetSettings({
    query: { enabled: open },
  });
  const maxDays = settings?.riskAcceptMaxDays ?? DEFAULT_RISK_ACCEPT_MAX_DAYS;

  const bulkDismissMutation =
    useVulnerabilitiesControllerBulkDismissVulnerabilities();

  const isBulk = vulnerabilityIds.length > 1;
  const isRisk = reason === DismissReason.risk_accepted;
  const expiryError = isRisk ? validateRiskExpiry(expiry, maxDays) : null;

  const reset = () => {
    setReason(initialReason);
    setComment('');
    setExpiry('');
    setTouched(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) reset();
  };

  const handleDismiss = () => {
    setTouched(true);
    if (!reason || vulnerabilityIds.length === 0 || expiryError) return;

    bulkDismissMutation.mutate(
      {
        data: {
          ids: vulnerabilityIds,
          reason,
          comment: comment.trim() || undefined,
          ...(isRisk
            ? {
                expiresAt: startOfDay(
                  parse(expiry, DATE_FORMAT, new Date()),
                ).toISOString(),
              }
            : {}),
        },
      },
      {
        onSuccess: () => {
          const what = isBulk
            ? t('vulnerabilities.dismiss.whatMany', { n: vulnerabilityIds.length })
            : vulnerabilityName
              ? t('vulnerabilities.dismiss.whatNamed', { name: vulnerabilityName })
              : t('vulnerabilities.dismiss.whatOne');
          toast.success(
            isRisk
              ? t('vulnerabilities.dismiss.toastRisk')
              : t('vulnerabilities.dismiss.toastDismissed'),
            {
              description: isRisk
                ? t('vulnerabilities.dismiss.acceptedUntil', { what, date: expiry })
                : t('vulnerabilities.dismiss.dismissedDesc', { what }),
            },
          );
          setOpen(false);
          reset();
          onDismissSuccess?.();
        },
        onError: (error) => {
          toast.error(t('vulnerabilities.dismiss.failed'), {
            description:
              error instanceof Error
                ? error.message
                : t('vulnerabilities.unexpectedError'),
          });
        },
      },
    );
  };

  const today = new Date();
  const isSubmitDisabled = !reason || bulkDismissMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'accept-risk'
              ? t('vulnerabilities.dismiss.titleRisk')
              : t('vulnerabilities.dismiss.title')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'accept-risk'
              ? t('vulnerabilities.dismiss.descRisk', { days: maxDays })
              : t('vulnerabilities.dismiss.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === 'dismiss' && (
            <RadioGroup
              value={reason}
              onValueChange={(value) => setReason(value as DismissReason)}
              className="space-y-3"
            >
              {DISMISS_REASONS.map((option) => (
                <div key={option.value} className="flex items-start space-x-3">
                  <RadioGroupItem
                    value={option.value}
                    id={`reason-${option.value}`}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5">
                    <Label
                      htmlFor={`reason-${option.value}`}
                      className="cursor-pointer font-medium"
                    >
                      {t(option.labelKey)}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t(option.descriptionKey)}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          )}

          {isRisk && (
            <div className="space-y-2">
              <Label htmlFor="risk-expiry">
                {t('vulnerabilities.dismiss.acceptedUntilLabel')}
              </Label>
              <Input
                id="risk-expiry"
                type="date"
                value={expiry}
                min={format(addDays(today, 1), DATE_FORMAT)}
                max={format(addDays(today, maxDays), DATE_FORMAT)}
                onChange={(e) => setExpiry(e.target.value)}
                aria-invalid={touched && !!expiryError}
              />
              {touched && expiryError ? (
                <p className="text-sm text-destructive" role="alert">
                  {expiryError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('vulnerabilities.dismiss.maxDays', { days: maxDays })}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="dismiss-comment">
              {t('vulnerabilities.dismiss.comment')}
            </Label>
            <Textarea
              id="dismiss-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                isRisk
                  ? t('vulnerabilities.dismiss.commentRisk')
                  : t('vulnerabilities.dismiss.commentPlaceholder')
              }
              className="resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={bulkDismissMutation.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleDismiss} disabled={isSubmitDisabled}>
            {bulkDismissMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isRisk
              ? t('vulnerabilities.dismiss.titleRisk')
              : t('vulnerabilities.dismiss.title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
