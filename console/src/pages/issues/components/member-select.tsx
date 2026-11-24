import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/lib/i18n-dictionary';
import { useWorkspacesControllerGetWorkspaceMembers } from '@/services/apis/gen/queries';
import { useMemo } from 'react';

export interface MemberOption {
  id: string;
  name: string;
  image: string | null;
}

/** Workspace members as `{ id, name, image }` (users only). */
export function useWorkspaceMemberOptions(): {
  members: MemberOption[];
  isLoading: boolean;
} {
  const { data, isLoading } = useWorkspacesControllerGetWorkspaceMembers();
  const members = useMemo(
    () =>
      (data ?? [])
        .map((member) => member.user)
        .filter((user): user is NonNullable<typeof user> => Boolean(user))
        .map((user) => ({ id: user.id, name: user.name, image: user.image })),
    [data],
  );
  return { members, isLoading };
}

const NONE = '__none__';

export function MemberSelect({
  value,
  onChange,
  placeholder,
  noneLabel,
  id,
  ariaLabel,
  disabled,
  className,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  noneLabel?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  const { members } = useWorkspaceMemberOptions();
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder ?? t('issues.member.unassigned')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          {noneLabel ?? t('issues.member.unassigned')}
        </SelectItem>
        {members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            {member.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
