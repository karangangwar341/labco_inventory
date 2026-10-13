'use client';

import React, { useState } from 'react';

interface ExtractedRowView {
  id: string;
  rowNumber: number;
  productName: string;
  quantity: number;
  unitName: string;
  batchNumber: string;
  expiryDate: string;
  locationName: string;
  confidence: number;
  validationStatus: 'VALID' | 'INVALID' | 'PENDING' | 'POSTED';
  hasDuplicateWarning: boolean;
  duplicateWarningReason?: string;
  errors: string[];
}

export default function ImportReviewPage() {
  const [importIntent, setImportIntent] = useState<'STOCK_IN' | 'STOCK_OUT' | 'PRODUCT_CATALOG'>('STOCK_IN');
  const [approvalMode, setApprovalMode] = useState<'ALL_OR_NOTHING' | 'PARTIAL'>('ALL_OR_NOTHING');
  const [fileName, setFileName] = useState('lab_consumables_batch_101.csv');
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchStatus, setBatchStatus] = useState<'DRAFT' | 'VALIDATED' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED'>('DRAFT');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sample initial rows reflecting extracted data
  const [rows, setRows] = useState<ExtractedRowView[]>([
    {
      id: 'row-1',
      rowNumber: 1,
      productName: 'Diagnostic Cartridge A',
      quantity: 100,
      unitName: 'PIECE',
      batchNumber: 'LOT-2026-A1',
      expiryDate: '2027-10-31',
      locationName: 'Central Storage Alpha',
      confidence: 0.96,
      validationStatus: 'VALID',
      hasDuplicateWarning: false,
      errors: [],
    },
    {
      id: 'row-2',
      rowNumber: 2,
      productName: 'Chemical Reagent 500ml',
      quantity: 25,
      unitName: 'BOTTLE',
      batchNumber: 'LOT-CHEM-99',
      expiryDate: '2026-12-15',
      locationName: 'Central Storage Alpha',
      confidence: 0.74,
      validationStatus: 'VALID',
      hasDuplicateWarning: false,
      errors: [],
    },
    {
      id: 'row-3',
      rowNumber: 3,
      productName: 'Diagnostic Cartridge A',
      quantity: 100,
      unitName: 'PIECE',
      batchNumber: 'LOT-2026-A1',
      expiryDate: '2027-10-31',
      locationName: 'Central Storage Alpha',
      confidence: 0.94,
      validationStatus: 'INVALID',
      hasDuplicateWarning: true,
      duplicateWarningReason: 'Duplicate item detected matching Row 1. Explicitly choose Keep Separate or Merge.',
      errors: ['Duplicate product/batch/location signature'],
    },
    {
      id: 'row-4',
      rowNumber: 4,
      productName: 'Glass Pipette 10ml',
      quantity: 15.5,
      unitName: 'PIECE',
      batchNumber: '',
      expiryDate: '',
      locationName: 'Central Storage Alpha',
      confidence: 0.88,
      validationStatus: 'INVALID',
      hasDuplicateWarning: false,
      errors: ['Product requires whole integer units. Fractional quantity 15.5 not permitted.'],
    },
  ]);

  const handleCellChange = (id: string, field: keyof ExtractedRowView, value: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        // Simple client-side re-validation preview
        if (field === 'quantity') {
          const num = Number(value);
          if (r.productName.includes('Pipette') && !Number.isInteger(num)) {
            updated.errors = ['Product requires whole integer units.'];
            updated.validationStatus = 'INVALID';
          } else {
            updated.errors = [];
            updated.validationStatus = 'VALID';
          }
        }
        return updated;
      }),
    );
  };

  const handleKeepSeparate = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, hasDuplicateWarning: false, errors: [], validationStatus: 'VALID' }
          : r,
      ),
    );
    setStatusMessage('Row duplicate confirmed as separate entry. Never silently merged.');
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setStatusMessage('Row removed from import draft.');
  };

  const validCount = rows.filter((r) => r.validationStatus === 'VALID' || r.validationStatus === 'POSTED').length;
  const invalidCount = rows.filter((r) => r.validationStatus === 'INVALID').length;

  const handleApproveBatch = () => {
    if (approvalMode === 'ALL_OR_NOTHING' && invalidCount > 0) {
      alert(`All-or-Nothing batch has ${invalidCount} invalid row(s). Zero rows will be posted until all rows are corrected.`);
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      if (approvalMode === 'ALL_OR_NOTHING') {
        setBatchStatus('APPROVED');
        setRows((prev) => prev.map((r) => ({ ...r, validationStatus: 'POSTED' })));
        setStatusMessage('Batch APPROVED: All rows posted atomically to inventory ledger.');
      } else {
        setBatchStatus('PARTIALLY_APPROVED');
        setRows((prev) =>
          prev.map((r) => (r.validationStatus === 'VALID' ? { ...r, validationStatus: 'POSTED' } : r)),
        );
        setStatusMessage(`Batch PARTIALLY APPROVED: Posted ${validCount} valid rows. ${invalidCount} invalid rows preserved.`);
      }
    }, 600);
  };

  const handleDownloadErrors = () => {
    const errorRows = rows.filter((r) => r.errors.length > 0);
    let csv = 'Row Number,Product Name,Quantity,Errors\n';
    errorRows.forEach((r) => {
      // Neutralize formula injection
      let sanitizedProduct = r.productName;
      if (/^[=+\-@]/.test(sanitizedProduct)) sanitizedProduct = `'${sanitizedProduct}`;
      csv += `${r.rowNumber},"${sanitizedProduct}",${r.quantity},"${r.errors.join('; ')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error_report_${fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header with Tenancy & Safety Non-Negotiable Callout */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 text-xs font-semibold mb-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
              Phase 8 • AI Data-Mapping & Bulk Ingestion
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Bulk Document Extraction & Review</h1>
            <p className="text-sm text-slate-400 mt-1">
              Deterministic parsing with Google Gemini multimodal mapping. Untrusted input boundary strictly enforced.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">Status:</span>
            <span
              className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                batchStatus === 'APPROVED'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  : batchStatus === 'PARTIALLY_APPROVED'
                  ? 'bg-amber-950 text-amber-300 border border-amber-700'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {batchStatus}
            </span>
          </div>
        </header>

        {/* Status Message Notification */}
        {statusMessage && (
          <div className="p-4 rounded-lg bg-indigo-950/60 border border-indigo-800/80 text-indigo-200 text-sm flex items-center justify-between">
            <span>{statusMessage}</span>
            <button onClick={() => setStatusMessage(null)} className="text-xs text-indigo-400 hover:text-white font-medium">Dismiss</button>
          </div>
        )}

        {/* Security & System Invariant Alert Card */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-amber-950/60 text-amber-400 border border-amber-800/60 font-bold">INVARIANT</span>
            <span>
              <strong>Never alters stock autonomously:</strong> AI outputs are unapproved candidate drafts. Stock ledger only posts after explicit Super Admin batch approval.
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Scan: <strong className="text-emerald-400">CLEAN</strong></span>
            <span>SHA-256: <strong className="font-mono text-slate-300">8f21...c99b</strong></span>
            <span>Size: <strong className="text-slate-300">14.2 KB</strong></span>
          </div>
        </div>

        {/* Controls & Configuration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Import Intent</label>
            <select
              value={importIntent}
              onChange={(e) => setImportIntent(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="STOCK_IN">STOCK_IN (Direct Supply / Inward)</option>
              <option value="STOCK_OUT">STOCK_OUT (Single-Warehouse Outward)</option>
              <option value="PRODUCT_CATALOG">PRODUCT_CATALOG (Master Definition)</option>
            </select>
            <p className="text-xs text-slate-500">Maps candidate fields to target warehouse movement schemas.</p>
          </div>

          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Approval Mode (D-005/006)</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input
                  type="radio"
                  name="approvalMode"
                  value="ALL_OR_NOTHING"
                  checked={approvalMode === 'ALL_OR_NOTHING'}
                  onChange={() => setApprovalMode('ALL_OR_NOTHING')}
                  className="accent-indigo-500"
                />
                All-Or-Nothing
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input
                  type="radio"
                  name="approvalMode"
                  value="PARTIAL"
                  checked={approvalMode === 'PARTIAL'}
                  onChange={() => setApprovalMode('PARTIAL')}
                  className="accent-indigo-500"
                />
                Partial Approval
              </label>
            </div>
            <p className="text-xs text-slate-500">
              {approvalMode === 'ALL_OR_NOTHING'
                ? 'All rows must pass server-side validation, or zero rows will be posted.'
                : 'Valid rows post atomically; invalid rows remain in draft for correction.'}
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Validation Health</span>
              <span className="text-xs font-mono">{validCount}/{rows.length} Valid</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden my-3">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${(validCount / (rows.length || 1)) * 100}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-400">✓ {validCount} Eligible</span>
              <span className={invalidCount > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                ✗ {invalidCount} Invalid/Flagged
              </span>
            </div>
          </div>
        </div>

        {/* Review Grid Table */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
          <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-white">Extracted Draft Rows</span>
              <span className="text-xs text-slate-400">Click any cell to correct data in place without re-upload</span>
            </div>
            {invalidCount > 0 && (
              <button
                onClick={handleDownloadErrors}
                className="px-3 py-1.5 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 hover:bg-rose-900 text-xs font-semibold flex items-center gap-2 transition"
              >
                <span>Download Error CSV</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-4 font-semibold w-12 text-center">#</th>
                  <th className="py-3 px-4 font-semibold">Product Name</th>
                  <th className="py-3 px-4 font-semibold">Quantity</th>
                  <th className="py-3 px-4 font-semibold">Unit</th>
                  <th className="py-3 px-4 font-semibold">Batch / Lot</th>
                  <th className="py-3 px-4 font-semibold">Expiry</th>
                  <th className="py-3 px-4 font-semibold">Confidence</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className={`hover:bg-slate-800/40 transition ${row.errors.length > 0 ? 'bg-rose-950/15' : ''}`}>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">{row.rowNumber}</td>
                      
                      <td className="py-3 px-4 font-medium">
                        <input
                          type="text"
                          value={row.productName}
                          onChange={(e) => handleCellChange(row.id, 'productName', e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none w-full text-slate-200"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={row.quantity}
                          onChange={(e) => handleCellChange(row.id, 'quantity', e.target.value)}
                          className={`bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none w-20 ${
                            row.errors.some((err) => err.includes('integer') || err.includes('quantity'))
                              ? 'text-rose-400 font-bold border-rose-500'
                              : 'text-slate-200'
                          }`}
                        />
                      </td>

                      <td className="py-3 px-4 text-slate-400">
                        <input
                          type="text"
                          value={row.unitName}
                          onChange={(e) => handleCellChange(row.id, 'unitName', e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none w-16 text-slate-300"
                        />
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400">
                        <input
                          type="text"
                          value={row.batchNumber}
                          placeholder="None"
                          onChange={(e) => handleCellChange(row.id, 'batchNumber', e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none w-28 text-slate-300"
                        />
                      </td>

                      <td className="py-3 px-4 text-slate-400">
                        <input
                          type="text"
                          value={row.expiryDate}
                          placeholder="None"
                          onChange={(e) => handleCellChange(row.id, 'expiryDate', e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none w-24 text-slate-300"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                            row.confidence >= 0.9
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : row.confidence >= 0.75
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {(row.confidence * 100).toFixed(0)}%
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            row.validationStatus === 'POSTED'
                              ? 'bg-blue-950 text-blue-300 border border-blue-700'
                              : row.validationStatus === 'VALID'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {row.validationStatus}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleRemoveRow(row.id)}
                          className="text-slate-500 hover:text-rose-400 transition"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>

                    {/* Duplicate Warning & Resolution Bar */}
                    {row.hasDuplicateWarning && (
                      <tr className="bg-amber-950/40 border-b border-amber-900/60">
                        <td colSpan={9} className="py-2.5 px-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200">
                            <div className="flex items-center gap-2">
                              <span className="font-bold">⚠️ DUPLICATE WARNING:</span>
                              <span>{row.duplicateWarningReason}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleKeepSeparate(row.id)}
                                className="px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 text-black font-bold text-[11px] transition"
                              >
                                Keep Separate Row
                              </button>
                              <button
                                onClick={() => handleRemoveRow(row.id)}
                                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700 transition"
                              >
                                Dismiss / Merge
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Row Errors */}
                    {row.errors.length > 0 && !row.hasDuplicateWarning && (
                      <tr className="bg-rose-950/30 border-b border-rose-900/40">
                        <td colSpan={9} className="py-2 px-6 text-rose-300 text-[11px]">
                          <strong>Validation Issue:</strong> {row.errors.join(' • ')}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-400">
            Posting target: <strong className="text-slate-200">Central Warehouse Stock Location (loc-wh-1)</strong>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setBatchStatus('REJECTED');
                setStatusMessage('Import batch rejected by Super Admin. Zero stock affected.');
              }}
              disabled={batchStatus === 'APPROVED'}
              className="px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition disabled:opacity-50"
            >
              Reject Batch
            </button>

            <button
              onClick={handleApproveBatch}
              disabled={isProcessing || batchStatus === 'APPROVED'}
              className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
            >
              {isProcessing ? 'Posting to Ledger...' : 'Approve & Post Batch (Super Admin)'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
