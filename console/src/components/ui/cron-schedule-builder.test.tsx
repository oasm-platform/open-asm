import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { CronScheduleBuilder } from '@/components/ui/cron-schedule-builder';
import { WEEKDAY_LABELS } from '@/lib/cron-schedule';

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
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('emits the default cron (daily 00:00 UTC for +07) on mount', () => {
    const { onChange } = renderBuilder();
    expect(onChange).toHaveBeenCalledWith({ cron: '0 17 * * *', timezone: 'Asia/Ho_Chi_Minh' });
  });

  it('renders the next-run preview with local time', () => {
    renderBuilder();
    expect(screen.getByText(/Next run/)).toBeInTheDocument();
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
    // default 00:00 +07 -> 17:00 UTC (previous day); dom shifts back one day
    // and day 1 lands on the previous month, so it is dropped.
    expect(onChange).toHaveBeenLastCalledWith({
      cron: '0 17 9,25 * *',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('preselects the current weekday when Weekly is chosen', async () => {
    const user = userEvent.setup();
    renderBuilder();
    // Expected value derives from the same real clock the builder uses, so no
    // fake timers are needed (vitest 4 fake timers deadlock the worker pool).
    const today = ((new Date().getDay() + 6) % 7) + 1; // 1=Mon .. 7=Sun
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    expect(
      screen.getByRole('button', { name: WEEKDAY_LABELS[today - 1] }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('emits weekly cron with selected days', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    // Weekly preselects today; clicking an already-selected day toggles it
    // OFF, so pick two days that can never collide with today. Local 00:00
    // +07 -> 17:00 UTC the previous day shifts each weekday back one day.
    const today = ((new Date().getDay() + 6) % 7) + 1; // 1=Mon .. 7=Sun
    const others = WEEKDAY_LABELS.map((_, i) => i + 1).filter((d) => d !== today);
    const picked = [others[0], others[3]];
    for (const day of picked) {
      await user.click(screen.getByRole('button', { name: WEEKDAY_LABELS[day - 1] }));
    }
    const shiftBack = (d: number) => ((((d - 2) % 7) + 7) % 7) + 1;
    const expected = [...new Set([...picked, today].map(shiftBack))].sort().join(',');
    expect(onChange).toHaveBeenLastCalledWith({
      cron: `0 17 * * ${expected}`,
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('parses an existing cron value into the form', () => {
    renderBuilder({ defaultValue: '30 1 * * 1' });
    // 01:30 UTC +07 -> 08:30 local; weekly with Monday selected
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('re-syncs the form state when defaultValue changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CronScheduleBuilder
        timezone="Asia/Ho_Chi_Minh"
        onChange={onChange}
        defaultValue="30 1 * * 1"
      />,
    );
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Switching the source cron rebuilds the selection: 00:00 UTC Wed is
    // 07:00 local Wed in +07.
    rerender(
      <CronScheduleBuilder
        timezone="Asia/Ho_Chi_Minh"
        onChange={onChange}
        defaultValue="0 0 * * 3"
      />,
    );
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Wed' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('prefills the hour/minute selects in local time, not UTC', () => {
    renderBuilder({ defaultValue: '0 3 * * *' });
    // 03:00 UTC is 10:00 local in Asia/Ho_Chi_Minh (+07)
    expect(screen.getByRole('combobox', { name: 'Hour' })).toHaveTextContent('10 AM');
    expect(screen.getByRole('combobox', { name: 'Minute' })).toHaveTextContent('00');
  });

  it('emits UTC cron from the selected time', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    await user.click(screen.getByRole('combobox', { name: 'Hour' }));
    await user.click(await screen.findByText('9 AM'));
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

  it('self-adjusts the timezone select when the timezone prop changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CronScheduleBuilder timezone="Asia/Ho_Chi_Minh" onChange={onChange} />,
    );
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent(
      /Asia\/Ho_Chi_Minh/,
    );
    // e.g. the browser/device timezone changed: the select must follow the new
    // timezone prop instead of keeping the value captured at mount.
    rerender(<CronScheduleBuilder timezone="Asia/Tokyo" onChange={onChange} />);
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent(
      /Asia\/Tokyo/,
    );
  });

  it('keeps a manually picked timezone when the timezone prop changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onTimezoneChange = vi.fn();
    const { rerender } = render(
      <CronScheduleBuilder
        timezone="Asia/Ho_Chi_Minh"
        onChange={onChange}
        onTimezoneChange={onTimezoneChange}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Timezone' }));
    await user.click(await screen.findByText(/Asia\/Tokyo/));
    expect(onTimezoneChange).toHaveBeenCalledWith('Asia/Tokyo');
    rerender(
      <CronScheduleBuilder
        timezone="America/New_York"
        onChange={onChange}
        onTimezoneChange={onTimezoneChange}
      />,
    );
    // the explicit user choice wins over automatic timezone detection
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent(
      /Asia\/Tokyo/,
    );
  });

  it('applies disabled state to controls', () => {
    renderBuilder({ disabled: true });
    expect(screen.getByRole('button', { name: 'Daily' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Hour' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }));
    // no emit happened from clicks
  });
});
