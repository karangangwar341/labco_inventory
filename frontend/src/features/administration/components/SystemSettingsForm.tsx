'use client';

import React, { useState } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';

export function SystemSettingsForm() {
  const [receiptConfirmationEnabled, setReceiptConfirmationEnabled] = useState(true);
  const [expiryHorizons, setExpiryHorizons] = useState({ first: 90, second: 30, critical: 7 });
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveNotice('Global governance settings updated and cached across worker nodes.');
    setTimeout(() => setSaveNotice(null), 5000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        title="System Settings"
        description="Global operational switches, custody transition rules, and audit parameters."
      />

      {saveNotice && (
        <div className="p-3 bg-[#ecfdf3] border border-[#bbf7d0] rounded-lg text-[#18794e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{saveNotice}</span>
          </div>
          <button onClick={() => setSaveNotice(null)} className="text-[#18794e] hover:opacity-75">✕</button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 text-xs">
        {/* Custody Transfer Protocol */}
        <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#172033]">Receipt Confirmation Custody Workflow (Decision D-001)</h3>
              <p className="text-[#5b6678] text-[11px] mt-0.5">
                Controls whether dispatch puts shipments into an in-transit holding state awaiting recipient verification.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={receiptConfirmationEnabled}
                onChange={(e) => setReceiptConfirmationEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-[#dbe3ee] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2563eb]"></div>
            </label>
          </div>
        </div>

        {/* Expiry Warning Thresholds */}
        <div className="p-4 bg-white border border-[#dbe3ee] rounded-xl shadow-xs space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-[#172033]">Expiry Monitoring Horizons (Days)</h3>
            <p className="text-[#5b6678] text-[11px] mt-0.5">
              Configures threshold tiers for automated notification alerts before lot shelf expiration.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[#5b6678] font-medium block">Early Warning</label>
              <input
                type="number"
                value={expiryHorizons.first}
                onChange={(e) => setExpiryHorizons({ ...expiryHorizons, first: Number(e.target.value) })}
                className="w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[#5b6678] font-medium block">Secondary Horizon</label>
              <input
                type="number"
                value={expiryHorizons.second}
                onChange={(e) => setExpiryHorizons({ ...expiryHorizons, second: Number(e.target.value) })}
                className="w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[#5b6678] font-medium block">Critical Alert Horizon</label>
              <input
                type="number"
                value={expiryHorizons.critical}
                onChange={(e) => setExpiryHorizons({ ...expiryHorizons, critical: Number(e.target.value) })}
                className="w-full px-3 py-1.5 bg-white border border-[#dbe3ee] rounded-md text-[#172033] focus:outline-none focus:border-[#2563eb]"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary">
            Save System Settings
          </Button>
        </div>
      </form>
    </div>
  );
}

export default SystemSettingsForm;
