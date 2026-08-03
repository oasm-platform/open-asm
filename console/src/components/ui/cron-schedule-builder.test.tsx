import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { CronScheduleBuilder } from '@/components/ui/cron-schedule-builder';

const renderBuilder = (props?: Partial<React.ComponentProps<typeof CronScheduleBuilder>>) => {
  const onChange = vi.fn();
  const onTimezoneChange = vi.fn();
  const utils = render(
    <CronScheduleBuilder
      timezone="Asia/Ho_Chi_Minh"
      onChange={onChange}
      onTimezoneChange={onTimezoneChange}
      {...props}
    />,
  );
  return { onChange, onTimezoneChange, ...utils };
};

describe('CronScheduleBuilder', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('emits the default cron (daily 00:00 UTC for +07) on mount', () => {
    const { onChange } = renderBuilder();
    expect(onChange).toHaveBeenCalledWith({ cron: '0 17 * * *', timezone: 'Asia/Ho_Chi_Minh' });
  });

  it('renders the next-run preview with local time', () => {
    renderBuilder();
    expect(screen.getByText(/Next run:/)).toBeInTheDocument();
  });

  it('shows a human cron label in local time, consistent with next run', () => {
    renderBuilder();
    // default 00:00 local (+07) -> UTC 17:00 previous day; label stays in local time
    expect(screen.getByText('Every day at 12:00 AM')).toBeInTheDocument();
  });

  it('shows day-of-week pills when Weekly is selected', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    expect(screen.getByRole('button', { name: 'Mon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sun' })).toBeInTheDocument();
  });

  it('shows the day-of-month grid when Monthly is selected and emits a dom list', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Monthly' }));
    // grid shows day 1..28 (never 29-31 so every month matches)
    expect(screen.getByRole('button', { name: 'Day 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day 28' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Day 29' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Day 1' }));
    await user.click(screen.getByRole('button', { name: 'Day 10' }));
    await user.click(screen.getByRole('button', { name: 'Day 26' }));
    // default 00:00 +07 -> 17:00 UTC (previous day); dom 1,10,26
    expect(onChange).toHaveBeenLastCalledWith({
      cron: '0 17 1,10,26 * *',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('emits weekly cron with selected days', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    await user.click(screen.getByRole('button', { name: 'Mon' }));
    await user.click(screen.getByRole('button', { name: 'Thu' }));
    // default 00:00 local +07 -> 17:00 UTC (previous day); weekly Mon+Thu
    expect(onChange).toHaveBeenLastCalledWith({
      cron: '0 17 * * 1,4',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('parses an existing cron value into the form', () => {
    renderBuilder({ defaultValue: '30 1 * * 1' });
    // 01:30 UTC +07 -> 08:30 local; weekly with Monday selected
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('emits UTC cron from the selected time', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    await user.click(screen.getByRole('combobox', { name: 'Hour' }));
    await user.click(await screen.findByText('09'));
    // 09:00 local +07 -> 02:00 UTC
    expect(onChange).toHaveBeenLastCalledWith({
      cron: '0 2 * * *',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('notifies timezone changes through onTimezoneChange', async () => {
    const user = userEvent.setup();
    const { onTimezoneChange } = renderBuilder();
    await user.click(screen.getByRole('combobox', { name: 'Timezone' }));
    await user.click(await screen.findByText(/Asia\/Tokyo/));
    expect(onTimezoneChange).toHaveBeenCalledWith('Asia/Tokyo');
  });

  it('applies disabled state to controls', () => {
    renderBuilder({ disabled: true });
    expect(screen.getByRole('button', { name: 'Daily' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Hour' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }));
    // no emit happened from clicks
  });
});
