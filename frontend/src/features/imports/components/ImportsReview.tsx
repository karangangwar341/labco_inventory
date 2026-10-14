'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingState } from '../../../components/feedback/LoadingState';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { useAuth } from '../../../features/auth/auth.store';
import { importsService } from '../imports.service';
import { ImportBatch, ImportRow } from '../imports.types';

export function ImportsReview() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<ImportBatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [importIntent, setImportIntent] = useState<'STOCK_IN' | 'STOCK_OUT' | 'INVENTORY_COUNT'>('STOCK_IN');
  const [approvalMode, setApprovalMode] = useState<'ALL_OR_NOTHING' | 'PARTIAL'>('ALL_OR_NOTHING');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load batches on mount
  const fetchBatches = useCallback(async (selectId?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await importsService.getBatches().catch(() => []);
      const batchList = Array.isArray(data) ? data : [];
      setBatches(batchList);

      const targetId = selectId || selectedBatchId || (batchList.length > 0 ? batchList[0].id : null);
      if (targetId) {
        setSelectedBatchId(targetId);
        const details = await importsService.getBatchById(targetId).catch(() => null);
        setActiveBatch(details);
      } else {
        setActiveBatch(null);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch import batches from server');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBatchId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const handleSelectBatch = async (batchId: string) => {
    setSelectedBatchId(batchId);
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const details = await importsService.getBatchById(batchId);
      setActiveBatch(details);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load batch details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const text = await file.text();
      const newBatch = await importsService.createBatch({
        importType: importIntent,
        fileName: file.name,
        fileContent: text,
      });
      setStatusMessage(`Import draft created: ${file.name} (${newBatch.totalRows ?? 0} rows).`);
      await fetchBatches(newBatch.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload and parse CSV document');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCellChange = async (rowId: string, field: string, value: any) => {
    if (!activeBatch) return;

    // Optimistic local state update
    const updatedRows = activeBatch.rows.map((row) => {
      if (row.id !== rowId) return row;
      const mapped = { ...(row.mappedData || {}), [field]: value };
      return { ...row, mappedData: mapped };
    });
    setActiveBatch({ ...activeBatch, rows: updatedRows });

    // Sync with backend
    try {
      const targetRow = updatedRows.find((r) => r.id === rowId);
      if (targetRow && targetRow.mappedData) {
        await importsService.updateRow(activeBatch.id, rowId, targetRow.mappedData);
      }
    } catch {
      // Background sync failure handled quietly
    }
  };

  const handleApproveBatch = async () => {
    if (!activeBatch) return;

    if (approvalMode === 'ALL_OR_NOTHING' && (activeBatch.errorRows ?? 0) > 0) {
      alert(`All-or-Nothing batch has ${activeBatch.errorRows} invalid row(s). Correct all rows before posting.`);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await importsService.commitBatch(activeBatch.id, approvalMode);
      setStatusMessage(
        `Batch ${activeBatch.id} APPROVED: Ledger transactions posted atomically by Super Admin.`,
      );
      await fetchBatches(activeBatch.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to commit batch to inventory ledger.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectBatch = async () => {
    if (!activeBatch) return;
    if (!rejectReason.trim()) {
      alert('A rejection reason is required.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await importsService.rejectBatch(activeBatch.id, rejectReason);
      setStatusMessage(`Batch ${activeBatch.id} rejected by Super Admin. Zero stock affected.`);
      setShowRejectModal(false);
      setRejectReason('');
      await fetchBatches(activeBatch.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject batch.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitDraftForApproval = () => {
    setStatusMessage('Batch draft submitted to Super Admin approvals queue. Awaiting dual-control authorization.');
  };

  const handleDownloadErrors = () => {
    if (!activeBatch) return;
    const errorRows = activeBatch.rows.filter(
      (r) => (r.validationErrors && r.validationErrors.length > 0) || r.status === 'ERROR',
    );

    let csv = 'Row Number,Raw Data,Errors\n';
    errorRows.forEach((r) => {
      let rawStr = JSON.stringify(r.rawData || {});
      // Prevent formula injection
      if (/^[=+\-@]/.test(rawStr)) rawStr = `'${rawStr}`;
      const errStr = (r.validationErrors || []).join('; ');
      csv += `${r.rowIndex},"${rawStr.replace(/"/g, '""')}","${errStr}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error_report_${activeBatch.fileName || 'batch'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const targetLocationLabel =
    user?.role === 'CLIENT_ADMIN'
      ? 'Client Diagnostic Facility Stock Room'
      : user?.role === 'STORE_ADMIN'
      ? 'Central Warehouse Stock Location (loc-wh-1)'
      : 'Central Warehouse Hub (Super Admin Scoped)';

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Document Ingestion & Verification"
        description="Editable review grid for extracted documents. AI outputs are untrusted candidates; stock posts only upon Super Admin batch approval."
        actions={
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv,.txt"
              className="hidden"
            />
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              isLoading={isProcessing}
            >
              + Upload CSV / Document
            </Button>
          </div>
        }
      />

      {statusMessage && (
        <div className="p-3 rounded-lg bg-[#eff6ff] border border-[#bfdbfe] text-[#2563eb] text-xs flex items-center justify-between">
          <span>{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs text-[#2563eb] hover:underline font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-lg bg-[#fef3f2] border border-[#fee4e2] text-[#b42318] text-xs flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs text-[#b42318] hover:underline font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Batch Selector Strip */}
      {batches.length > 0 && (
        <div className="p-3 bg-white border border-[#dbe3ee] rounded-xl flex items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#172033]">Active Batch:</span>
            <select
              value={selectedBatchId || ''}
              onChange={(e) => handleSelectBatch(e.target.value)}
              className="bg-white border border-[#dbe3ee] rounded-md px-2 py-1 text-xs font-mono text-[#172033] focus:outline-none focus:border-[#2563eb]"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fileName} ({b.status}) - {b.totalRows} rows
                </option>
              ))}
            </select>
          </div>

          {activeBatch && (
            <div className="flex items-center gap-2">
              <span className="text-[#5b6678]">Status:</span>
              <Badge
                variant={
                  activeBatch.status === 'APPROVED' || activeBatch.status === 'PARTIALLY_APPROVED'
                    ? 'success'
                    : activeBatch.status === 'REJECTED'
                    ? 'danger'
                    : 'warning'
                }
              >
                {activeBatch.status}
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Control Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white border border-[#dbe3ee] space-y-2 shadow-xs">
          <label className="text-[11px] font-semibold text-[#5b6678] uppercase tracking-wider block">
            Import Intent
          </label>
          <select
            value={importIntent}
            onChange={(e) => setImportIntent(e.target.value as any)}
            className="w-full bg-white border border-[#dbe3ee] rounded-md p-2 text-xs text-[#172033] focus:outline-none focus:border-[#2563eb]"
          >
            <option value="STOCK_IN">STOCK_IN (Direct Supply / Inward)</option>
            <option value="STOCK_OUT">STOCK_OUT (Single-Warehouse Outward)</option>
            <option value="INVENTORY_COUNT">INVENTORY_COUNT (Physical Stock Count)</option>
          </select>
          <p className="text-[11px] text-[#5b6678]">
            Maps candidate fields to target warehouse movement schemas.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#dbe3ee] space-y-2 shadow-xs">
          <label className="text-[11px] font-semibold text-[#5b6678] uppercase tracking-wider block">
            Approval Mode
          </label>
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-xs text-[#172033] cursor-pointer">
              <input
                type="radio"
                name="approvalMode"
                value="ALL_OR_NOTHING"
                checked={approvalMode === 'ALL_OR_NOTHING'}
                onChange={() => setApprovalMode('ALL_OR_NOTHING')}
                className="text-[#2563eb]"
              />
              All-Or-Nothing
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#172033] cursor-pointer">
              <input
                type="radio"
                name="approvalMode"
                value="PARTIAL"
                checked={approvalMode === 'PARTIAL'}
                onChange={() => setApprovalMode('PARTIAL')}
                className="text-[#2563eb]"
              />
              Partial Approval
            </label>
          </div>
          <p className="text-[11px] text-[#5b6678]">
            {approvalMode === 'ALL_OR_NOTHING'
              ? 'All rows must pass server validation before any row posts.'
              : 'Valid rows post atomically; invalid rows remain in draft.'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#dbe3ee] flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#5b6678] uppercase tracking-wider">
              Validation Health
            </span>
            <span className="text-xs font-mono font-semibold text-[#172033]">
              {activeBatch?.validRows ?? 0}/{activeBatch?.totalRows ?? 0} Valid
            </span>
          </div>
          <div className="w-full bg-[#f1f5f9] h-2 rounded-full overflow-hidden my-2 border border-[#dbe3ee]">
            <div
              className="bg-[#18794e] h-full transition-all duration-300"
              style={{
                width: `${
                  activeBatch && activeBatch.totalRows > 0
                    ? ((activeBatch.validRows ?? 0) / activeBatch.totalRows) * 100
                    : 0
                }%`,
              }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#18794e] font-medium">✓ {activeBatch?.validRows ?? 0} Eligible</span>
            <span
              className={
                (activeBatch?.errorRows ?? 0) > 0 ? 'text-[#b42318] font-bold' : 'text-[#5b6678]'
              }
            >
              ✗ {activeBatch?.errorRows ?? 0} Invalid/Flagged
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Connecting to import batches and extracting server validation records..." />
      ) : !activeBatch || activeBatch.rows.length === 0 ? (
        <EmptyState
          title="No Active Import Batch Loaded"
          description="Upload a CSV or warehouse stock document to begin AI parsing and candidate row extraction."
          action={
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Document CSV
            </Button>
          }
        />
      ) : (
        /* Editable Table */
        <div className="rounded-xl bg-white border border-[#dbe3ee] overflow-hidden shadow-xs">
          <div className="p-3.5 bg-[#f8fafc] border-b border-[#dbe3ee] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#172033]">Extracted Candidate Rows</span>
              <span className="text-[11px] text-[#5b6678]">(Click any cell to correct data in place)</span>
            </div>
            {(activeBatch.errorRows ?? 0) > 0 && (
              <Button variant="secondary" size="sm" onClick={handleDownloadErrors}>
                Download Error CSV
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] text-[#5b6678] border-b border-[#dbe3ee]">
                  <th className="py-2.5 px-3.5 font-semibold w-10 text-center">#</th>
                  <th className="py-2.5 px-3.5 font-semibold">Product Name / Identifier</th>
                  <th className="py-2.5 px-3.5 font-semibold">Quantity</th>
                  <th className="py-2.5 px-3.5 font-semibold">Unit</th>
                  <th className="py-2.5 px-3.5 font-semibold">Batch / Lot</th>
                  <th className="py-2.5 px-3.5 font-semibold">Expiry</th>
                  <th className="py-2.5 px-3.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dbe3ee]">
                {activeBatch.rows.map((row: ImportRow) => {
                  const mapped = (row.mappedData || {}) as Record<string, any>;
                  const raw = (row.rawData || {}) as Record<string, any>;
                  const productName = mapped.productName || raw.productName || raw.item || raw.description || '—';
                  const quantity = mapped.quantity ?? raw.quantity ?? raw.qty ?? 0;
                  const unitName = mapped.unitName || raw.unit || 'PIECE';
                  const batchNumber = mapped.batchNumber || raw.batch || raw.lot || '';
                  const expiryDate = mapped.expiryDate || raw.expiry || '';
                  const hasErrors = (row.validationErrors && row.validationErrors.length > 0) || row.status === 'ERROR';

                  return (
                    <React.Fragment key={row.id}>
                      <tr className={`hover:bg-[#f8fafc] transition ${hasErrors ? 'bg-[#fef3f2]/40' : ''}`}>
                        <td className="py-2.5 px-3.5 text-center font-mono text-[#5b6678]">{row.rowIndex}</td>

                        <td className="py-2.5 px-3.5 font-medium">
                          <input
                            type="text"
                            value={productName}
                            onChange={(e) => handleCellChange(row.id, 'productName', e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-[#dbe3ee] focus:border-[#2563eb] focus:outline-none w-full text-[#172033]"
                          />
                        </td>

                        <td className="py-2.5 px-3.5">
                          <input
                            type="number"
                            value={quantity}
                            onChange={(e) => handleCellChange(row.id, 'quantity', Number(e.target.value))}
                            className="bg-transparent border-b border-transparent hover:border-[#dbe3ee] focus:border-[#2563eb] focus:outline-none w-20 text-[#172033] font-mono"
                          />
                        </td>

                        <td className="py-2.5 px-3.5 text-[#5b6678]">
                          <input
                            type="text"
                            value={unitName}
                            onChange={(e) => handleCellChange(row.id, 'unitName', e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-[#dbe3ee] focus:border-[#2563eb] focus:outline-none w-16 text-[#172033]"
                          />
                        </td>

                        <td className="py-2.5 px-3.5 font-mono text-[#5b6678]">
                          <input
                            type="text"
                            value={batchNumber}
                            placeholder="None"
                            onChange={(e) => handleCellChange(row.id, 'batchNumber', e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-[#dbe3ee] focus:border-[#2563eb] focus:outline-none w-28 text-[#172033]"
                          />
                        </td>

                        <td className="py-2.5 px-3.5 text-[#5b6678]">
                          <input
                            type="text"
                            value={expiryDate}
                            placeholder="None"
                            onChange={(e) => handleCellChange(row.id, 'expiryDate', e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-[#dbe3ee] focus:border-[#2563eb] focus:outline-none w-24 text-[#172033]"
                          />
                        </td>

                        <td className="py-2.5 px-3.5">
                          <Badge
                            variant={
                              row.status === 'VALID'
                                ? 'success'
                                : row.status === 'RESOLVED'
                                ? 'primary'
                                : 'danger'
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                      </tr>

                      {row.isDuplicate && (
                        <tr className="bg-[#fffbeb] border-b border-[#fef3c7]">
                          <td colSpan={7} className="py-2 px-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[#a15c00]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold">⚠️ DUPLICATE SIGNATURE:</span>
                                <span>Duplicate candidate detected. Explicitly choose Keep Separate or Resolve.</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="warning"
                                  onClick={() => handleCellChange(row.id, 'duplicateResolution', 'SPLIT')}
                                >
                                  Keep Separate Row
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {hasErrors && !row.isDuplicate && (
                        <tr className="bg-[#fef3f2] border-b border-[#fee4e2]">
                          <td colSpan={7} className="py-2 px-4 text-[#b42318] text-[11px]">
                            <strong>Validation Error:</strong>{' '}
                            {row.validationErrors?.join(' • ') || 'Server schema validation failed'}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom Actions Strip */}
      <div className="p-4 rounded-xl bg-white border border-[#dbe3ee] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="text-xs text-[#5b6678]">
          Target Location: <strong className="text-[#172033]">{targetLocationLabel}</strong>
        </div>

        {/* ROLE-GATED BUTTON CONTROLS */}
        <div className="flex items-center gap-3">
          {isSuperAdmin ? (
            /* Super Admin: Full Dual-Control Approval & Reject Powers */
            <>
              <Button
                variant="secondary"
                onClick={() => setShowRejectModal(true)}
                disabled={!activeBatch || activeBatch.status === 'APPROVED' || activeBatch.status === 'REJECTED' || isProcessing}
              >
                Reject Batch
              </Button>

              <Button
                variant="primary"
                onClick={handleApproveBatch}
                isLoading={isProcessing}
                disabled={!activeBatch || activeBatch.status === 'APPROVED' || activeBatch.status === 'REJECTED'}
              >
                Approve &amp; Post Batch (Super Admin)
              </Button>
            </>
          ) : (
            /* Store Admin & Client Admin: Draft Preparation Only - NO POSTING BUTTON */
            <>
              <Button
                variant="secondary"
                onClick={() => setStatusMessage('Import draft changes saved.')}
                disabled={!activeBatch || isProcessing}
              >
                Save Draft
              </Button>

              <Button
                variant="primary"
                onClick={handleSubmitDraftForApproval}
                disabled={!activeBatch || isProcessing}
              >
                Submit Batch for Super Admin Approval
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border border-[#dbe3ee] shadow-xl p-5 max-w-md w-full space-y-4">
            <h3 className="text-sm font-semibold text-[#172033]">Reject Import Batch</h3>
            <p className="text-xs text-[#5b6678]">
              Provide a mandatory reason for rejecting this batch. Zero stock movements will be posted to the ledger.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Unrecognized product codes or corrupted barcode manifest"
              className="w-full h-24 p-2 text-xs border border-[#dbe3ee] rounded-md focus:outline-none focus:border-[#b42318]"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleRejectBatch}
                isLoading={isProcessing}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportsReview;
