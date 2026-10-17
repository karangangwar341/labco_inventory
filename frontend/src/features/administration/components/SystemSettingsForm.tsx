'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { notificationsService } from '../../notifications/notifications.service';
import { NotificationSettings } from '../../notifications/notifications.types';
import { queryKeys } from '../../../lib/query/query-keys';

const DEFAULT_SETTINGS: NotificationSettings = {
  receiptConfirmationEnabled: true,
  expiryWarningIntervals: [90, 30, 7],
  soundEnabled: false,
};

export function SystemSettingsForm() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: queryKeys.notifications.settings(), queryFn: notificationsService.getSettings });
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: notificationsService.updateSettings,
    onSuccess: async (settings) => {
      setDraft(settings);
      setNotice('Settings saved.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.settings() });
    },
  });

  const intervals = [draft.expiryWarningIntervals[0] ?? 90, draft.expiryWarningIntervals[1] ?? 30, draft.expiryWarningIntervals[2] ?? 7];
  const validIntervals = intervals.every((value) => Number.isInteger(value) && value > 0)
    && intervals[0] > intervals[1] && intervals[1] > intervals[2];

  const save = (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    saveMutation.mutate({ ...draft, expiryWarningIntervals: intervals });
  };

  if (settingsQuery.isLoading) return <LoadingState message="Loading system settings..." />;
  if (settingsQuery.error) return <ErrorState message={settingsQuery.error instanceof Error ? settingsQuery.error.message : 'Could not load system settings.'} onRetry={() => settingsQuery.refetch()} />;

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="System settings" description="Control shipment receipt confirmation and in-app alerts." />
      {notice && <div role="status" className="rounded-lg border border-[#bbf7d0] bg-[#ecfdf3] p-3 text-sm text-[#18794e]">{notice}</div>}
      {saveMutation.error && <div role="alert" className="rounded-lg border border-[#fecdca] bg-[#fef3f2] p-3 text-sm text-[#b42318]">{saveMutation.error instanceof Error ? saveMutation.error.message : 'Could not save settings.'}</div>}

      <form onSubmit={save} className="space-y-4">
        <section className="space-y-3 rounded-xl border border-[#dbe3ee] bg-white p-4">
          <div>
            <h2 className="text-base font-semibold text-[#172033]">Shipment receipt confirmation</h2>
            <p className="mt-1 text-sm text-[#5b6678]">When enabled, an approved dispatch waits for the client to confirm the received quantities. When disabled, stock transfers to the client atomically when the dispatch is approved.</p>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-[#172033]">
            <input type="checkbox" checked={draft.receiptConfirmationEnabled} onChange={(event) => setDraft({ ...draft, receiptConfirmationEnabled: event.target.checked })} />
            Require receipt confirmation
          </label>
        </section>

        <section className="space-y-3 rounded-xl border border-[#dbe3ee] bg-white p-4">
          <div>
            <h2 className="text-base font-semibold text-[#172033]">Expiry warning days</h2>
            <p className="mt-1 text-sm text-[#5b6678]">Enter three whole-number thresholds in descending order, such as 90, 30, and 7 days.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {intervals.map((value, index) => <label key={index} className="space-y-1 text-sm font-medium text-[#172033]">{['Early warning', 'Upcoming', 'Urgent'][index]}
              <input type="number" min={1} step={1} value={value} onChange={(event) => setDraft({ ...draft, expiryWarningIntervals: intervals.map((item, itemIndex) => itemIndex === index ? Number(event.target.value) : item) })} className="min-h-10 w-full rounded-md border border-[#dbe3ee] px-3 font-normal" />
            </label>)}
          </div>
          {!validIntervals && <p role="alert" className="text-sm text-[#b42318]">Use three positive whole numbers, from the largest warning window to the smallest.</p>}
        </section>

        <section className="space-y-3 rounded-xl border border-[#dbe3ee] bg-white p-4">
          <div><h2 className="text-base font-semibold text-[#172033]">Notification sound</h2><p className="mt-1 text-sm text-[#5b6678]">Sound is off by default.</p></div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-[#172033]"><input type="checkbox" checked={draft.soundEnabled} onChange={(event) => setDraft({ ...draft, soundEnabled: event.target.checked })} />Play sound for in-app notifications</label>
        </section>

        <div className="flex justify-end"><Button type="submit" disabled={!validIntervals || saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : 'Save settings'}</Button></div>
      </form>
    </div>
  );
}

export default SystemSettingsForm;
