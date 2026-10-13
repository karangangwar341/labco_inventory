import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans">
      <main className="max-w-6xl mx-auto px-6 py-16 w-full space-y-12">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Warehouse & Manufacturing AI Operations Platform
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Labco Warehouse & Inventory Management
          </h1>
          <p className="max-w-2xl text-slate-400 text-base leading-relaxed">
            End-to-end ACID inventory ledger, multi-tenant client manufacturing, department traceability, and AI-assisted document ingestion with row-locking concurrency control.
          </p>
        </header>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            href="/imports"
            className="group p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/60 hover:bg-slate-850 transition duration-200 flex flex-col justify-between shadow-lg"
          >
            <div className="space-y-3">
              <span className="text-2xl p-2.5 rounded-xl bg-indigo-950/80 text-indigo-400 inline-block border border-indigo-800/60">
                📄
              </span>
              <h2 className="text-xl font-bold text-white group-hover:text-indigo-300 transition">
                Bulk AI Document Import & Review
              </h2>
              <p className="text-sm text-slate-400 leading-normal">
                Multimodal AI extraction, field mapping, confidence scoring, duplicate warnings, and all-or-nothing/partial Super Admin posting.
              </p>
            </div>
            <div className="mt-6 flex items-center text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
              Open Review Console →
            </div>
          </Link>

          <Link
            href="/backups"
            className="group p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/60 hover:bg-slate-850 transition duration-200 flex flex-col justify-between shadow-lg"
          >
            <div className="space-y-3">
              <span className="text-2xl p-2.5 rounded-xl bg-rose-950/80 text-rose-400 inline-block border border-rose-800/60">
                🛡️
              </span>
              <h2 className="text-xl font-bold text-white group-hover:text-indigo-300 transition">
                Backups, Monitoring & Restore Drills
              </h2>
              <p className="text-sm text-slate-400 leading-normal">
                90-day retention, 3x automated retry with persistent Super Admin warnings, and isolated environment restore drills.
              </p>
            </div>
            <div className="mt-6 flex items-center text-xs font-semibold text-rose-400 group-hover:text-rose-300">
              Open Resiliency Console →
            </div>
          </Link>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between shadow-lg">
            <div className="space-y-3">
              <span className="text-2xl p-2.5 rounded-xl bg-emerald-950/80 text-emerald-400 inline-block border border-emerald-800/60">
                ⚖️
              </span>
              <h2 className="text-xl font-bold text-white">
                Immutable Stock Ledger & Balance
              </h2>
              <p className="text-sm text-slate-400 leading-normal">
                ACID row-locking balance projection: Physical = Usable + Damaged + Expired. Reservations guarantee Available = Usable - Reserved ≥ 0.
              </p>
            </div>
            <div className="mt-6 text-xs font-mono text-emerald-400">
              Active • Enforcing Invariants
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between shadow-lg">
            <div className="space-y-3">
              <span className="text-2xl p-2.5 rounded-xl bg-purple-950/80 text-purple-400 inline-block border border-purple-800/60">
                🏭
              </span>
              <h2 className="text-xl font-bold text-white">
                Client Manufacturing & Departments
              </h2>
              <p className="text-sm text-slate-400 leading-normal">
                Linked & separate production workflows, atomic input deduction, department issue/return history with condition buckets.
              </p>
            </div>
            <div className="mt-6 text-xs font-mono text-purple-400">
              Active • Client Tenancy Scoped
            </div>
          </div>
        </div>

        {/* System Architecture Invariants Strip */}
        <section className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Non-Negotiable System Invariants
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-300">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <strong className="text-white block mb-1">Untrusted AI Data</strong>
              No autonomous approvals or duplicate merging.
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <strong className="text-white block mb-1">Zero Negative Stock</strong>
              Available = Usable - Reserved ≥ 0 enforced on commit.
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <strong className="text-white block mb-1">Tenant Privacy</strong>
              Inbound shipments conceal source warehouse identity.
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <strong className="text-white block mb-1">Append-Only Ledger</strong>
              Corrections via linked reversal/replacement pairs only.
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        Labco Instruments Warehouse & Client Inventory Platform • Phase 8 Complete
      </footer>
    </div>
  );
}
