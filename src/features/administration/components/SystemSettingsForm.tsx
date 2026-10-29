'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
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
  soundEnabled: false,
  approvalRequirements: {
    stockRequests: { STOCK_IN: true, STOCK_OUT: true, DISPATCH: true, TRANSFER: true, ADJUSTMENT: true },
    shipmentReceipt: true,
    manufacturing: true,
    departmentIssue: true,
    departmentReturn: true,
    imports: { stockIn: true, stockOut: true },
  },
};

const APPROVAL_LABELS = [
  ['stockRequests.STOCK_IN', 'Stock-in requests'],
  ['stockRequests.STOCK_OUT', 'Stock-out requests'],
  ['stockRequests.DISPATCH', 'Dispatches to projects'],
  ['stockRequests.TRANSFER', 'Warehouse transfers'],
  ['stockRequests.ADJUSTMENT', 'Physical count adjustments'],
  ['shipmentReceipt', 'Shipment receipt confirmation'],
  ['manufacturing', 'Manufacturing runs'],
  ['departmentIssue', 'Department issue batches'],
  ['imports.stockIn', 'Stock-in imports'],
  ['imports.stockOut', 'Stock-out imports'],
] as const;

function setApprovalRequirement(settings: NotificationSettings, key: string, value: boolean): NotificationSettings {
  const [group, field] = key.split('.');
  if (group === 'stockRequests' && field) {
    return { ...settings, approvalRequirements: { ...settings.approvalRequirements, stockRequests: { ...settings.approvalRequirements.stockRequests, [field]: value } } };
  }
  if (group === 'imports' && field) {
    return { ...settings, approvalRequirements: { ...settings.approvalRequirements, imports: { ...settings.approvalRequirements.imports, [field]: value } } };
  }
  if (group === 'shipmentReceipt' || group === 'manufacturing' || group === 'departmentIssue' || group === 'departmentReturn') {
    return { ...settings, approvalRequirements: { ...settings.approvalRequirements, [group]: value } };
  }
  return settings;
}

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

  const save = (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    saveMutation.mutate(draft);
  };

  if (settingsQuery.isLoading) return <LoadingState message="Loading system settings..." />;
  if (settingsQuery.error) return <ErrorState message={settingsQuery.error instanceof Error ? settingsQuery.error.message : 'Could not load system settings.'} onRetry={() => settingsQuery.refetch()} />;

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="System settings" description="Set approval requirements and notification behavior for inventory workflows." />
      {notice && <div role="status" className="rounded-lg border border-[#bbf7d0] bg-[#ecfdf3] p-3 text-sm text-[#18794e]">{notice}</div>}
      {saveMutation.error && <div role="alert" className="rounded-lg border border-[#fecdca] bg-[#fef3f2] p-3 text-sm text-[#b42318]">{saveMutation.error instanceof Error ? saveMutation.error.message : 'Could not save settings.'}</div>}

      <form onSubmit={save} className="space-y-4">
        <section className="space-y-3 rounded-xl border border-[#dbe3ee] bg-white p-4">
          <div>
            <h2 className="text-base font-semibold text-[#172033]">Approval requirements &amp; Dual-Control Governance</h2>
            <p className="mt-1 text-sm text-[#5b6678]">Choose which inventory workflows wait for Super Admin review. A policy change applies strictly to new submissions.</p>
            <div className="mt-2.5 p-3 rounded-lg bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong>Operational Impact:</strong> When enabled, requests require explicit Super Admin approval before stock is committed or released. When disabled, validated submissions post atomically to balances upon receipt.
              </span>
            </div>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 pt-1">
            {APPROVAL_LABELS.map(([key, label]) => {
              const [group, field] = key.split('.');
              const enabled = field
                ? Boolean((draft.approvalRequirements[group as 'stockRequests' | 'imports'] as Record<string, boolean>)[field])
                : Boolean(draft.approvalRequirements[group as 'shipmentReceipt' | 'manufacturing' | 'departmentIssue' | 'departmentReturn']);
              return (
                <div key={key} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                  <label className="flex items-start gap-2.5 text-sm font-medium text-[#172033] cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      checked={enabled}
                      onChange={(event) => setDraft((current) => setApprovalRequirement(current, key, event.target.checked))}
                    />
                    <div>
                      <span>{label}</span>
                      <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                        {enabled ? '🛡️ Requires Super Admin approval' : '⚡ Posts atomically on submission'}
                      </p>
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-[#dbe3ee] bg-white p-4">
          <div>
            <h2 className="text-base font-semibold text-[#172033]">Shipment receipt confirmation</h2>
            <p className="mt-1 text-sm text-[#5b6678]">When enabled, an approved dispatch waits for the project to confirm the received quantities. When disabled, stock transfers to the project atomically when the dispatch is approved.</p>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-[#172033]">
            <input type="checkbox" checked={draft.receiptConfirmationEnabled} onChange={(event) => setDraft({ ...draft, receiptConfirmationEnabled: event.target.checked })} />
            Require receipt confirmation
          </label>
        </section>

        <section className="space-y-3 rounded-xl border border-[#dbe3ee] bg-white p-4">
          <div><h2 className="text-base font-semibold text-[#172033]">Notification sound</h2><p className="mt-1 text-sm text-[#5b6678]">Sound is off by default.</p></div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-[#172033]"><input type="checkbox" checked={draft.soundEnabled} onChange={(event) => setDraft({ ...draft, soundEnabled: event.target.checked })} />Play sound for in-app notifications</label>
        </section>

        <section className="space-y-3 rounded-xl border border-[#dbe3ee] bg-white p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#172033]">Measurement Units &amp; Packaging Formats</h2>
              <p className="mt-1 text-sm text-[#5b6678]">
                Manage global standard units (vials, boxes, packs, volumes, weights) available across catalog items and requests.
              </p>
            </div>
            <Link
              href="/catalog?tab=UNITS"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200 shrink-0"
            >
              <span>📏 Open Units Directory →</span>
            </Link>
          </div>
        </section>

        <div className="flex justify-end"><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : 'Save settings'}</Button></div>
      </form>
    </div>
  );
}

export default SystemSettingsForm;
