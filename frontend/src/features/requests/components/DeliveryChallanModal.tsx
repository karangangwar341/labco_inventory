'use client';

import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { StockRequest, StockRequestLine } from '../requests.types';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/auth.store';

interface DeliveryChallanModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: StockRequest;
}

export function DeliveryChallanModal({ isOpen, onClose, request }: DeliveryChallanModalProps) {
  const { role } = useAuth();
  const challanRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string>('/labco-logo.png');

  // Convert logo to base64 Data URL to prevent canvas tainting
  useEffect(() => {
    fetch('/labco-logo.png')
      .then((res) => res.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setLogoDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {});
  }, []);

  // Prevent background scrolling and reset modal scroll to top when opened
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const requestNumber = request.requestNumber || 'Not assigned';
  const challanNumber = request.requestNumber ? `CHAL-${request.requestNumber}` : 'Delivery-Challan';
  const formattedDate = new Date(request.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = new Date(request.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const originName =
    request.sourceLocation?.warehouse?.name ||
    request.sourceLocation?.client?.name ||
    request.locationName ||
    'Central Warehouse';

  const destinationName =
    request.destinationLocation?.client?.name ||
    request.destinationLocation?.warehouse?.name ||
    request.destinationName ||
    request.client?.name ||
    'Client Facility / Department';

  const isWarehouseToClient = request.requestType === 'DISPATCH' || originName.toLowerCase().includes('warehouse');
  const documentTitle = isWarehouseToClient
    ? 'DELIVERY CHALLAN & STOCK DISPATCH SLIP'
    : 'INTERNAL STOCK TRANSFER & ISSUE VOUCHER';

  const totalQuantity = request.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  // Dedicated clean A4 printing with zero parent container clipping
  const handlePrint = () => {
    if (!challanRef.current) return;

    const printHtml = challanRef.current.outerHTML;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const logoUrl = origin ? `${origin}/labco-logo.png` : '/labco-logo.png';
    const finalHtml = printHtml.replaceAll('/labco-logo.png', logoUrl);

    // 1. Try dedicated print popup window
    const printWindow = window.open('', '_blank', 'width=880,height=950');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Delivery Challan - ${challanNumber}</title>
            <style>
              @page {
                size: A4 portrait;
                margin: 8mm 10mm;
              }
              *, *::before, *::after {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
                color: #0f172a;
                font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              }
              .print-wrapper {
                width: 100%;
                max-width: 780px;
                margin: 0 auto;
                padding: 10px 0;
              }
              .print-wrapper #printable-challan, #printable-challan {
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                max-width: 100% !important;
              }
              @media print {
                body {
                  padding: 0;
                  margin: 0;
                }
              }
            </style>
          </head>
          <body>
            <div class="print-wrapper">
              ${finalHtml}
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                }, 350);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      return;
    }

    // 2. Fallback: Hidden iframe printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <title>Delivery Challan - ${challanNumber}</title>
            <style>
              @page { size: A4 portrait; margin: 8mm 10mm; }
              *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              body { margin: 0; padding: 10px; background: #fff; font-family: "IBM Plex Sans", system-ui, -apple-system, sans-serif; }
              #printable-challan { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
            </style>
          </head>
          <body>
            ${finalHtml}
          </body>
        </html>
      `);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
        }, 2000);
      }, 400);
    }
  };

  const handleDownloadPdf = () => {
    handlePrint();
  };

  // Safe canvas generation that intercepts Tailwind CSS v4's modern lab() and oklab() colors
  const generateCanvas = async (element: HTMLElement) => {
    const origGCS = window.getComputedStyle;
    window.getComputedStyle = function (elt: Element, pseudoElt?: string | null) {
      const cs = origGCS.call(window, elt, pseudoElt);
      return new Proxy(cs, {
        get(target, prop) {
          if (prop === 'getPropertyValue') {
            return function (name: string) {
              const res = target.getPropertyValue(name);
              if (typeof res === 'string' && (res.includes('lab(') || res.includes('oklab(') || res.includes('color('))) {
                if (name.toLowerCase().includes('background')) return 'rgb(255, 255, 255)';
                if (name.toLowerCase().includes('border')) return 'rgb(15, 23, 42)';
                return 'rgb(15, 23, 42)';
              }
              return res;
            };
          }
          let val: unknown;
          try {
            val = (target as any)[prop];
          } catch {
            return undefined;
          }
          if (typeof val === 'function') return val.bind(target);
          if (typeof val === 'string' && (val.includes('lab(') || val.includes('oklab(') || val.includes('color('))) {
            if (String(prop).toLowerCase().includes('background')) return 'rgb(255, 255, 255)';
            if (String(prop).toLowerCase().includes('border')) return 'rgb(15, 23, 42)';
            return 'rgb(15, 23, 42)';
          }
          return val;
        },
      });
    };

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc: Document) => {
          // Remove all stylesheets from cloned iframe to strip Tailwind v4's lab/oklab color definitions
          const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
          styles.forEach((s) => s.remove());
          clonedDoc.documentElement.style.backgroundColor = '#ffffff';
          clonedDoc.documentElement.style.color = '#0f172a';
          clonedDoc.body.style.backgroundColor = '#ffffff';
          clonedDoc.body.style.color = '#0f172a';
          clonedDoc.body.style.margin = '0';
          clonedDoc.body.style.padding = '0';
        },
      });
      return canvas;
    } finally {
      window.getComputedStyle = origGCS;
    }
  };

  const handleDownloadImage = async () => {
    if (!challanRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await generateCanvas(challanRef.current);

      canvas.toBlob((blob) => {
        if (!blob) {
          const dataUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = dataUrl;
          downloadLink.download = `Delivery_Challan_${challanNumber}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          showToast('Challan image downloaded successfully!');
          return;
        }

        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `Delivery_Challan_${challanNumber}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast('Challan image downloaded successfully!');
      }, 'image/png');
    } catch (err) {
      console.error('Failed to export image', err);
      showToast('Could not export image. Please try printing directly.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    const shareTitle = `Delivery Challan - ${challanNumber}`;
    const shareText = `Labco Instruments Delivery Challan for ${request.lines.length} items (${totalQuantity} units) from ${originName} to ${destinationName}.`;

    if (navigator.share && challanRef.current) {
      try {
        const canvas = await generateCanvas(challanRef.current);
        canvas.toBlob(async (blob) => {
          if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], `${challanNumber}.png`, { type: 'image/png' })] })) {
            const file = new File([blob], `${challanNumber}.png`, { type: 'image/png' });
            await navigator.share({
              title: shareTitle,
              text: shareText,
              files: [file],
            });
          } else {
            await navigator.share({
              title: shareTitle,
              text: shareText,
              url: window.location.href,
            });
          }
        });
        return;
      } catch {
        // Fall back to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareTitle}\n${shareText}\nView: ${window.location.href}`);
      showToast('Challan details copied to clipboard!');
    } catch {
      showToast('Could not copy to clipboard.');
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-60 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-700 animate-fade-in no-print">
          {toastMsg}
        </div>
      )}

      {/* Modal Dialog Card (Bounded to 92vh height) */}
      <div className="relative w-full max-w-4xl h-[92vh] max-h-[92vh] bg-white rounded-xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden">
        
        {/* Sticky Control Header Bar (shrink-0 so it stays visible while scrolling) */}
        <div className="shrink-0 z-20 px-4 sm:px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📄</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Delivery Challan &amp; Dispatch Receipt
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {challanNumber} · ISO 9001:2015 Quality Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              title="Print document or save as PDF"
              className="gap-1.5 text-xs font-semibold shadow-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print Directly</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadPdf}
              title="Save as PDF document"
              className="gap-1.5 text-xs text-slate-700 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Save PDF</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              isLoading={isExporting}
              onClick={handleDownloadImage}
              title="Download challan as high-resolution PNG image"
              className="gap-1.5 text-xs text-slate-700 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Image</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleShare}
              title="Share document or copy link"
              className="gap-1.5 text-xs text-slate-700 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Share</span>
            </Button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-1"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Document Container — full white background */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto bg-white"
        >
          
          {/* Authentic Physical Document Sheet (Self-contained styling) */}
          <div
            id="printable-challan"
            ref={challanRef}
            style={{
              width: '100%',
              maxWidth: '780px',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              padding: '30px 34px',
              boxSizing: 'border-box',
              fontFamily: 'IBM Plex Sans, system-ui, -apple-system, sans-serif',
              fontSize: '11px',
              lineHeight: '1.4',
              margin: '0 auto',
            }}
          >
            {/* Top Header Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '12px' }}>
              <div style={{ maxWidth: '480px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoDataUrl}
                  crossOrigin="anonymous"
                  alt="Labco Instruments"
                  style={{ height: '42px', width: 'auto', display: 'block', marginBottom: '8px', objectFit: 'contain' }}
                />
                <div style={{ fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0f172a' }}>
                  LABCO INSTRUMENTS PVT. LTD.
                </div>
                <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                  Precision Diagnostic Equipment, Laboratory Reagents &amp; Consumables
                </div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>
                  ISO 9001:2015 CERTIFIED QUALITY MANAGEMENT SYSTEM
                </div>
              </div>

              {/* Serial Box on Right */}
              <div style={{ border: '1px solid #0f172a', padding: '8px 12px', textAlign: 'right', backgroundColor: '#f8fafc', minWidth: '180px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a' }}>
                  DELIVERY CHALLAN
                </div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace', margin: '2px 0' }}>
                  {challanNumber}
                </div>
                <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '4px', marginTop: '4px', fontSize: '10px', color: '#475569' }}>
                  <div>Date: <strong style={{ color: '#0f172a' }}>{formattedDate}</strong></div>
                  <div>Time: <span>{formattedTime}</span></div>
                  <div style={{ fontFamily: 'monospace', fontSize: '9px', color: '#64748b' }}>Ref: {requestNumber}</div>
                </div>
              </div>
            </div>

            {/* Document Title Banner */}
            <div style={{ backgroundColor: '#0f172a', color: '#ffffff', textAlign: 'center', padding: '6px 10px', fontWeight: 800, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
              {documentTitle}
            </div>

            {/* Movement Particulars (2 Columns) */}
            <table className="print-document-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #0f172a', marginBottom: '12px', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ width: '50%', borderRight: '1px solid #0f172a', padding: '10px 12px', verticalAlign: 'top', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '4px' }}>
                      Dispatched From (Consignor / Origin)
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{originName}</div>
                    <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>
                      Dispatched by: <strong style={{ color: '#0f172a' }}>{request.requester?.username || request.requesterUsername || 'Store Staff'}</strong>
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                      Movement: {isWarehouseToClient ? 'Warehouse to Client Dispatch' : 'Internal Department Transfer'}
                    </div>
                  </td>
                  <td style={{ width: '50%', padding: '10px 12px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '4px' }}>
                      Dispatched To (Consignee / Destination)
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{destinationName}</div>
                    {request.reason && (
                      <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>
                        Purpose / Notes: <em>{request.reason}</em>
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                      Status: <strong style={{ color: '#1d4ed8' }}>{request.status.replaceAll('_', ' ')}</strong>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Itemised Goods Table */}
            <table className="print-document-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #0f172a', marginBottom: '12px', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #0f172a', textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '7px 8px', borderRight: '1px solid #0f172a', width: '36px', textAlign: 'center' }}>#</th>
                  <th style={{ padding: '7px 10px', borderRight: '1px solid #0f172a', textAlign: 'left' }}>Description of Goods / Reagents</th>
                  <th style={{ padding: '7px 8px', borderRight: '1px solid #0f172a', width: '110px', textAlign: 'left' }}>Batch / Lot</th>
                  <th style={{ padding: '7px 8px', borderRight: '1px solid #0f172a', width: '95px', textAlign: 'left' }}>Expiry Date</th>
                  <th style={{ padding: '7px 8px', borderRight: '1px solid #0f172a', width: '85px', textAlign: 'center' }}>Condition</th>
                  <th style={{ padding: '7px 10px', width: '100px', textAlign: 'right' }}>Dispatched Qty</th>
                </tr>
              </thead>
              <tbody>
                {request.lines.map((line: StockRequestLine, index: number) => {
                  const productName = line.productName || line.product?.name || `Item ${index + 1}`;
                  const brand = line.product?.brand;
                  const unit = line.unit || line.unitNameSnapshot || 'Units';
                  const qty = Number(line.quantity || 0);
                  const expiry = line.expiryDate
                    ? new Date(line.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—';

                  return (
                    <tr key={line.id || index} style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #0f172a', fontFamily: 'monospace', color: '#64748b' }}>
                        {index + 1}
                      </td>
                      <td style={{ padding: '6px 10px', borderRight: '1px solid #0f172a' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{productName}</div>
                        {brand && role !== 'CLIENT_ADMIN' && <div style={{ fontSize: '10px', color: '#64748b' }}>Brand: {brand}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #0f172a', fontFamily: 'monospace', fontSize: '10px', fontWeight: 600 }}>
                        {line.batchNumber || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #0f172a', fontSize: '10px', color: '#475569' }}>
                        {expiry}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #0f172a', fontSize: '10px', fontWeight: 600 }}>
                        {line.condition || 'USABLE'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        {qty.toLocaleString()} <span style={{ fontSize: '10px', fontWeight: 400, color: '#64748b' }}>{unit}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #0f172a', fontWeight: 800, fontSize: '11px' }}>
                  <td colSpan={4} style={{ padding: '8px 10px', borderRight: '1px solid #0f172a' }}>
                    Total Line Items: {request.lines.length}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'center', borderRight: '1px solid #0f172a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Net Units
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                    {totalQuantity.toLocaleString()} Units
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Quality Declaration Box */}
            <div style={{ border: '1px solid #0f172a', padding: '8px 10px', fontSize: '10px', color: '#334155', backgroundColor: '#f8fafc', marginBottom: '14px', lineHeight: '1.4' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '2px' }}>
                ISO 9001:2015 Quality &amp; Chain-of-Custody Declaration:
              </div>
              <div>
                We hereby certify that the diagnostic instruments and reagents detailed above have been inspected and packed 
                in compliance with ISO 9001:2015 quality standards. Consignee is requested to verify count and lot seals upon receipt.
              </div>
            </div>

            {/* 3-Column Formal Signature Blocks */}
            <table className="print-document-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #0f172a', fontSize: '10px', marginBottom: '10px' }}>
              <tbody>
                <tr>
                  <td style={{ width: '33.33%', borderRight: '1px solid #0f172a', padding: '10px', verticalAlign: 'top', height: '100px' }}>
                    <div style={{ fontWeight: 800, textTransform: 'uppercase', color: '#0f172a' }}>
                      1. Prepared &amp; Dispatched By
                    </div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Store In-Charge / Warehouse Staff</div>
                    <div style={{ borderTop: '1px dashed #94a3b8', paddingTop: '6px', marginTop: '38px' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>Authorized Signature &amp; Stamp</div>
                      <div style={{ fontSize: '9px', color: '#64748b' }}>Date: ________________________</div>
                    </div>
                  </td>
                  <td style={{ width: '33.33%', borderRight: '1px solid #0f172a', padding: '10px', verticalAlign: 'top', height: '100px' }}>
                    <div style={{ fontWeight: 800, textTransform: 'uppercase', color: '#0f172a' }}>
                      2. Carrier / Transport Mode
                    </div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Driver / Courier Handover</div>
                    <div style={{ borderTop: '1px dashed #94a3b8', paddingTop: '6px', marginTop: '38px' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>Carrier Signature: ____________</div>
                      <div style={{ fontSize: '9px', color: '#64748b' }}>Vehicle / Tracking No: _________</div>
                    </div>
                  </td>
                  <td style={{ width: '33.33%', padding: '10px', verticalAlign: 'top', height: '100px' }}>
                    <div style={{ fontWeight: 800, textTransform: 'uppercase', color: '#0f172a' }}>
                      3. Received in Good Order By
                    </div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Consignee Receiving Staff</div>
                    <div style={{ borderTop: '1px dashed #94a3b8', paddingTop: '6px', marginTop: '38px' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>Consignee Seal &amp; Signature</div>
                      <div style={{ fontSize: '9px', color: '#64748b' }}>Received Date &amp; Time: _________</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Bottom Verification Details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: '#64748b', fontFamily: 'monospace', paddingTop: '4px', borderTop: '1px solid #cbd5e1' }}>
              <span>Electronic document generated by Labco Warehouse &amp; Stock</span>
              <span>Labco Instruments Pvt. Ltd. · ISO 9001:2015</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

export default DeliveryChallanModal;
