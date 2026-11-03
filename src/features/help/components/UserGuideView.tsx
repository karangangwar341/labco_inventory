'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

// Type definitions for guide sections and markers
interface MarkerItem {
  number: number;
  label: string;
  description: string;
  tip?: string;
}

interface GuideSection {
  id: string;
  title: string;
  badge: string;
  roles: ('SUPER_ADMIN' | 'STORE_ADMIN' | 'PROJECT_ADMIN')[];
  summary: string;
  directLink?: { href: string; label: string };
  screenshot: {
    title: string;
    url: string;
    type: 'catalog' | 'stock-in' | 'shipment' | 'clone-modal' | 'manufacturing' | 'departments' | 'navigation';
  };
  markers: MarkerItem[];
  stepByStep: string[];
  proTips: string[];
}

export function UserGuideView() {
  const [selectedRole, setSelectedRole] = useState<'ALL' | 'SUPER_ADMIN' | 'STORE_ADMIN' | 'PROJECT_ADMIN'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMarker, setActiveMarker] = useState<{ sectionId: string; markerNum: number } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Guide sections content
  const sections: GuideSection[] = useMemo(() => [
    {
      id: 'system-navigation',
      title: '1. System Navigation & Sidebar Domains',
      badge: 'Core Foundation',
      roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'],
      summary: 'Understand the main sidebar navigation domains, fast role switcher, and location-aware context bar.',
      directLink: { href: '/', label: 'Go to Daily Operations' },
      screenshot: {
        title: 'Main Navigation Bar & Domain Menu',
        url: 'https://labcoims.vercel.app/',
        type: 'navigation',
      },
      markers: [
        {
          number: 1,
          label: 'Primary Navigation Domains',
          description: 'Access Daily Operations, Stock Movements, Products & Bills, Reports & Downloads, and System Administration.',
          tip: 'Clicking any domain expands its relevant operational sub-views and routes.',
        },
        {
          number: 2,
          label: 'Active Location / Project Indicator',
          description: 'Displays whether you are currently acting on the Central Warehouse (e.g. Vikas Nagar Office) or a specific Project site (e.g. RML Lucknow).',
          tip: 'Stock requests and approvals are always tied strictly to the selected operating location.',
        },
        {
          number: 3,
          label: 'Pending Approvals & Notifications',
          description: 'Top notification bell highlights pending stock requests, transit receipts, and catalog submissions requiring action.',
        },
        {
          number: 4,
          label: 'User Account & Fast Role Switcher',
          description: 'Shows your signed-in username, active role pill, and quick logout button.',
        },
      ],
      stepByStep: [
        'Use the left sidebar to navigate across the 5 primary operations domains.',
        'Always verify your active warehouse or project context in the top header before submitting transactions.',
        'Watch for amber badges next to "Stock Movements" indicating requests waiting for your approval or dispatch.',
      ],
      proTips: [
        'Super Admins can view all projects and warehouses globally.',
        'Warehouse Admins can only view and manage inventory for their assigned warehouse.',
        'Project Admins have isolated views showing only their project-allocated stock.',
      ],
    },
    {
      id: 'catalog-management',
      title: '2. Product Catalog, Categories & Multi-Unit Conversions',
      badge: 'Products & Bills',
      roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'],
      summary: 'Manage raw materials, finished products, category taxonomies, maker brands, and packaging conversion rates.',
      directLink: { href: '/catalog', label: 'Open Product Catalog' },
      screenshot: {
        title: 'Product Catalog & Classification View',
        url: 'https://labcoims.vercel.app/catalog',
        type: 'catalog',
      },
      markers: [
        {
          number: 1,
          label: 'Category & Subcategory Taxonomy',
          description: 'Browse classifications (e.g., Cotton → Cotton 200gsm). Categories organize products and can be seeded into projects.',
          tip: 'Subcategories inherit parent taxonomy rules.',
        },
        {
          number: 2,
          label: 'Brand / Maker Classification',
          description: 'Brand tag (e.g., Labco, 3M, Sigma) enables rapid filtering and supplier quality tracking.',
        },
        {
          number: 3,
          label: 'Base Inventory Unit & Packaging Multiples',
          description: 'Physical inventory is always booked in the Base Unit (e.g. Kilogram, Meter, Piece). Secondary packaging units (e.g. Roll = 50 kg, Box = 100 pcs) have a fixed conversion factor.',
          tip: 'Stock ledger calculations use fixed decimal precision against the base unit to avoid rounding drift.',
        },
        {
          number: 4,
          label: 'Isolated Warehouse Available Stock',
          description: 'Reflects real-time usable stock located strictly in company warehouses. Project site stock is strictly segregated and never mixes into central balances.',
        },
        {
          number: 5,
          label: 'Catalog Action Buttons',
          description: 'Quickly create new Raw Materials, add custom Categories, register Maker Brands, or trigger the AI Invoice Scanner.',
        },
      ],
      stepByStep: [
        'Navigate to Products & Bills → Product Catalog (/catalog).',
        'Click "+ Raw Material" or "+ Add Category" to register new items.',
        'Set the Base Inventory Unit first (e.g. Kilogram). Then add any packaging multiples (e.g., 1 Box = 25 Kilogram).',
        'New products created by staff enter DRAFT status until approved by a Super Admin.',
      ],
      proTips: [
        'Never change a base unit after stock transactions have occurred; create a new SKU or packaging conversion instead.',
        'Categories can be transferred into project catalogs even before products are assigned to them.',
      ],
    },
    {
      id: 'stock-in',
      title: '3. Inbound Stock In (Vendor Purchases & Receipts)',
      badge: 'Daily Operations',
      roles: ['SUPER_ADMIN', 'STORE_ADMIN'],
      summary: 'Receive vendor deliveries into company warehouses with invoice tracking, packaging unit calculators, and Super Admin verification.',
      directLink: { href: '/requests/new?type=STOCK_IN', label: 'Create Stock In Request' },
      screenshot: {
        title: 'New Stock In Movement Form',
        url: 'https://labcoims.vercel.app/requests/new?type=STOCK_IN',
        type: 'stock-in',
      },
      markers: [
        {
          number: 1,
          label: 'Destination Warehouse Selector',
          description: 'Select the target physical warehouse receiving the stock (e.g. Vikas Nagar Office).',
        },
        {
          number: 2,
          label: 'Product Autocomplete & Category Filter',
          description: 'Search by SKU or name, or narrow down by Category and Subcategory to quickly find the exact product.',
        },
        {
          number: 3,
          label: 'Packaging Unit & Conversion Calculator',
          description: 'Select either the Base Unit (kg) or Packaging Multiples (e.g. Box). The system automatically multiplies the factor and displays the resulting base stock.',
        },
        {
          number: 4,
          label: 'Supplier / Vendor & Invoice Reference',
          description: 'Enter the Vendor Name, Purchase Order Number, and Delivery Challan / Invoice number for audit compliance.',
        },
        {
          number: 5,
          label: 'Submit for Approval Button',
          description: 'Submits the request to the Super Admin queue. Once approved, the stock is booked atomically to the immutable ledger.',
        },
      ],
      stepByStep: [
        'Go to Stock Movements → New Request or click "Start stock in".',
        'Select Movement Type: "Stock In (Purchase/Inward)".',
        'Select your receiving warehouse and add line items with product, packaging unit, and received quantity.',
        'Attach the vendor name, invoice number, and delivery date.',
        'Click "Submit Request". The request status becomes PENDING_APPROVAL until verified by a Super Admin.',
      ],
      proTips: [
        'Stock does not increase until the Super Admin approves the request.',
        'If the Super Admin has enabled instant posting policy for vendor stock-in, it will book immediately with an audit log.',
      ],
    },
    {
      id: 'project-dispatches',
      title: '4. Project Dispatches & Inbound Shipments Tracking',
      badge: 'Stock Movements',
      roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'],
      summary: 'Dispatch materials from the central warehouse to remote project locations with Gate Pass Challans, live tracking, and receipt verification.',
      directLink: { href: '/shipments', label: 'View Shipments' },
      screenshot: {
        title: 'Inbound Shipments & Receiving Interface',
        url: 'https://labcoims.vercel.app/shipments',
        type: 'shipment',
      },
      markers: [
        {
          number: 1,
          label: 'Transit Shipment Card & Challan #',
          description: 'Shows the auto-generated delivery challan number, dispatch date, and vehicle/driver remarks.',
          tip: 'Project Admins receive an in-app alert when a shipment is marked IN_TRANSIT.',
        },
        {
          number: 2,
          label: 'Dispatched Quantity vs Received Check',
          description: 'Clearly displays the exact quantity and unit dispatched by the warehouse storekeeper.',
        },
        {
          number: 3,
          label: 'One-Click "Receive Stock" Action',
          description: 'Project Admin verifies physical packages on site and clicks "Receive Stock" to atomically book the goods into the Project inventory.',
        },
        {
          number: 4,
          label: 'Discrepancy & Damaged Stock Resolver',
          description: 'If boxes are damaged or short, clicking "Report Discrepancy" records the variance. Damaged goods are automatically logged in the immutable ledger as an approved stock-out flagged DAMAGED.',
        },
        {
          number: 5,
          label: 'Print Delivery Challan',
          description: 'Download or print the physical Gate Pass Challan document with driver signature and warehouse stamps.',
        },
      ],
      stepByStep: [
        'Warehouse Admin creates a "Project Dispatch" request under Stock Movements → New Request.',
        'Upon Super Admin approval, stock is deducted from the warehouse and an IN_TRANSIT shipment is generated.',
        'When physical goods reach the project site, the Project Admin opens Shipments (/shipments).',
        'Review the line items and click "Receive Stock" to confirm.',
        'Stock is immediately credited to the project balance and the shipment status updates to DELIVERED.',
      ],
      proTips: [
        'Project Admins cannot see warehouse identity or costs—only shipment reference, product name, and dispatched quantities.',
        'Never accept a shipment without inspecting physical seals. If counts do not match, use "Report Discrepancy" immediately.',
      ],
    },
    {
      id: 'transfer-catalog',
      title: '5. Seeding & Transferring Catalog to Projects',
      badge: 'System Administration',
      roles: ['SUPER_ADMIN'],
      summary: 'Empower projects to start immediately by transferring company product catalogs and category hierarchies without re-entering data.',
      directLink: { href: '/admin/projects', label: 'Manage Projects' },
      screenshot: {
        title: 'Transfer Catalog to Project Modal',
        url: 'https://labcoims.vercel.app/admin/projects',
        type: 'clone-modal',
      },
      markers: [
        {
          number: 1,
          label: 'Select by Category Hierarchy',
          description: 'View the full company category taxonomy. Check any top-level category or subcategory to transfer it into the project.',
          tip: 'Checking a category will automatically seed that taxonomy hierarchy into the project.',
        },
        {
          number: 2,
          label: 'Select All / Deselect All Controls',
          description: 'Quickly select all categories with one click, or clear selections instantly.',
        },
        {
          number: 3,
          label: 'Select by Product Tab',
          description: 'Filter specific approved products by name, brand, or SKU if you only want to transfer a subset of items.',
        },
        {
          number: 4,
          label: 'Live Selection Counter Badge',
          description: 'Displays exact count of categories and products selected (e.g. "19 Categories, 1 Product Selected").',
        },
        {
          number: 5,
          label: 'Transfer & Seed Button',
          description: 'Executes the transfer. Cloned items become project-scoped items (ownerScope: PROJECT) ready for local production runs.',
        },
      ],
      stepByStep: [
        'Open System Administration → Projects (/admin/projects).',
        'In the Project Directory list, click "Transfer Catalog" on the target project card.',
        'In the modal, check the categories and products you wish to transfer.',
        'Review the selection counter in the footer, then click "Transfer Categories & Products".',
        'The project admin can now immediately see these items in their local catalog and BOM configurations!',
      ],
      proTips: [
        'You can also seed categories and products automatically when creating a new project by choosing the "Custom Seed" option in the registration form.',
        'Cloned items operate under PROJECT scope, preventing accidental modifications to the master company catalog.',
      ],
    },
    {
      id: 'manufacturing-bom',
      title: '6. Manufacturing & Bill of Materials (BOM) Runs',
      badge: 'Manufacturing',
      roles: ['SUPER_ADMIN', 'PROJECT_ADMIN'],
      summary: 'Convert raw materials into finished manufactured goods through recipe-based Bill of Materials and tracked production batches.',
      directLink: { href: '/manufacturing', label: 'Go to Manufacturing' },
      screenshot: {
        title: 'Production Run & BOM Execution Dashboard',
        url: 'https://labcoims.vercel.app/manufacturing',
        type: 'manufacturing',
      },
      markers: [
        {
          number: 1,
          label: 'Finished Good Recipe Definition',
          description: 'Defines the recipe: how many units of Raw Material A and Raw Material B are required to produce 1 unit of Finished Good.',
        },
        {
          number: 2,
          label: 'Raw Material Sufficiency Check',
          description: 'The system automatically verifies whether project usable stock has sufficient quantities before allowing a run to start.',
        },
        {
          number: 3,
          label: 'Batch Production Execution',
          description: 'Starting a run moves required raw materials into RESERVED status, preventing them from being consumed elsewhere.',
        },
        {
          number: 4,
          label: 'Quality Inspection & Output Completion',
          description: 'Upon production completion, raw materials are atomically deducted and finished products are credited to available inventory.',
        },
      ],
      stepByStep: [
        'Go to Manufacturing → Production Runs (/manufacturing).',
        'Select the target Finished Good and enter the desired production quantity.',
        'Verify required component quantities on the BOM calculator.',
        'Click "Start Production Run". Once finished, enter verified good units and scrap quantity.',
        'Submit for completion. Finished items are added directly to your project stock ledger.',
      ],
      proTips: [
        'Always ensure raw material packaging conversions match the recipe consumption units.',
        'Scrap or defective output during manufacturing must be flagged to maintain 100% audit accuracy.',
      ],
    },
    {
      id: 'departments-consumption',
      title: '7. Department Issues & Consumables Requisitions',
      badge: 'Daily Operations',
      roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'],
      summary: 'Issue operational supplies, consumables, and tools to internal departments (e.g. Quality, Production, Packaging) with return tracking.',
      directLink: { href: '/departments?tab=ISSUES', label: 'Department Requisitions' },
      screenshot: {
        title: 'Department Material Issue Voucher',
        url: 'https://labcoims.vercel.app/departments',
        type: 'departments',
      },
      markers: [
        {
          number: 1,
          label: 'Target Department Selection',
          description: 'Choose the receiving internal department (e.g. Packaging, Quality Control, Sterilization).',
        },
        {
          number: 2,
          label: 'Requisition Purpose & Line Items',
          description: 'Specify the items, quantities, and operational justification.',
        },
        {
          number: 3,
          label: 'Stock Issue Voucher & Deduction',
          description: 'Authorizing the issue deducts the stock from the warehouse or project store with an immutable audit record.',
        },
        {
          number: 4,
          label: 'Department Return Workflow',
          description: 'Unused materials can be returned using the Returns tab, safely re-crediting the inventory balance.',
        },
      ],
      stepByStep: [
        'Navigate to Daily Operations → Departments (/departments).',
        'Select the "Issues" tab and click "New Issue Voucher".',
        'Select the Department, purpose, and line items.',
        'Submit the voucher. Once authorized, stock is deducted from store balances.',
        'If any material remains unused, go to the "Returns" tab to record returned items.',
      ],
      proTips: [
        'Department issues prevent untracked "shrinkage" by tying every consumed item to a department budget or team.',
      ],
    },
  ], []);

  // Filter sections by role and search query
  const filteredSections = useMemo(() => {
    return sections.filter((sec) => {
      const matchesRole = selectedRole === 'ALL' || sec.roles.includes(selectedRole);
      if (!matchesRole) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const inTitle = sec.title.toLowerCase().includes(q);
      const inSummary = sec.summary.toLowerCase().includes(q);
      const inMarkers = sec.markers.some((m) => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));
      const inSteps = sec.stepByStep.some((s) => s.toLowerCase().includes(q));
      return inTitle || inSummary || inMarkers || inSteps;
    });
  }, [sections, selectedRole, searchQuery]);

  // Frequently Asked Questions
  const faqs = [
    {
      q: 'Why does my available stock not update immediately after creating a Stock In request?',
      a: 'The system strictly enforces financial and audit governance. By default, all inventory-affecting transactions require Super Admin approval. Once a Super Admin approves the request, the stock is booked atomically to the ledger and becomes immediately usable. If your organization has enabled auto-approval for vendor purchases, it posts instantaneously.',
    },
    {
      q: 'Why cannot Project Admins see central warehouse inventory?',
      a: 'This is an intentional security and isolation boundary. Project Admins only see stock that has been explicitly dispatched and received into their local project site. This ensures project teams focus on their assigned operational budget and prevents unauthorized cross-project visibility.',
    },
    {
      q: 'How do unit conversions work when ordering by Box or Roll?',
      a: 'Each product has a single immutable Base Unit (e.g. Kilogram or Piece). Packaging multiples (e.g. Roll = 50 kg) have an exact conversion factor configured under Products & Bills → Units of Measure. When you enter 2 Rolls, the system automatically books 100 kg to the stock ledger. You can view both packaging units and base units on all reports.',
    },
    {
      q: 'What should I do if a shipment arrives with damaged or missing items?',
      a: 'When receiving the shipment under Stock Movements → Shipments, click "Report Discrepancy" instead of standard acceptance. Enter the exact damaged or missing quantity. The system automatically accepts the intact items into your project inventory and logs the damaged quantity into the immutable ledger as an approved stock-out flagged DAMAGED.',
    },
    {
      q: 'How do I transfer categories and products to a new project without starting from scratch?',
      a: 'Go to System Administration → Projects (/admin/projects). You can either select "Seed Custom Catalog" when creating a new project, or click "Transfer Catalog" on an existing project. In the modal, you can select specific categories (and their subcategories) or individual products and transfer them with one click.',
    },
  ];

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Official User Manual
              </span>
              <span className="text-slate-400 text-xs">• Version 2.4</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Labco Instruments WMS Software Guide
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              Complete step-by-step documentation with annotated software screenshots, visual marker callouts, workflows, and operational procedures for all system roles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-xs transition-all shadow-xs cursor-pointer"
            >
              <svg className="w-4 h-4 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print / Save PDF</span>
            </button>
            <Link
              href="/catalog"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-md cursor-pointer"
            >
              <span>Launch App</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Quick Role & Search Filter Toolbar */}
        <div className="mt-8 pt-6 border-t border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Role Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800 self-start">
            <span className="text-[11px] font-semibold text-slate-400 px-2.5 py-1">Role Filter:</span>
            {[
              { id: 'ALL', label: 'All Roles (Overview)' },
              { id: 'SUPER_ADMIN', label: '👑 Super Admin' },
              { id: 'STORE_ADMIN', label: '🏬 Warehouse Admin' },
              { id: 'PROJECT_ADMIN', label: '🏗️ Project Admin' },
            ].map((roleOption) => (
              <button
                key={roleOption.id}
                type="button"
                onClick={() => setSelectedRole(roleOption.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedRole === roleOption.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {roleOption.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics, markers, SKU, challan..."
              className="w-full px-3.5 py-2 pl-9 rounded-xl text-xs bg-slate-950/70 text-white placeholder-slate-400 border border-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 shadow-inner"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Navigation Jump Bar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max text-xs">
          <span className="font-bold text-slate-700 px-2 flex items-center gap-1.5">
            <span>⚡ Jump to:</span>
          </span>
          {sections.map((sec, idx) => (
            <a
              key={sec.id}
              href={`#${sec.id}`}
              className="px-2.5 py-1 rounded-md bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-600 font-medium border border-slate-200 transition-colors"
            >
              {idx + 1}. {sec.title.split('. ')[1] || sec.title}
            </a>
          ))}
          <a
            href="#faq-section"
            className="px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium border border-amber-200 transition-colors"
          >
            ❓ FAQ
          </a>
        </div>
      </div>

      {/* Guide Sections */}
      <div className="space-y-12">
        {filteredSections.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <span className="text-3xl">🔍</span>
            <h3 className="font-bold text-slate-800 text-base">No guide topics match your search query</h3>
            <p className="text-xs text-slate-500">Try searching for keywords like "catalog", "shipment", "stock in", "challan", or clear the filter.</p>
            <Button variant="secondary" size="sm" onClick={() => { setSearchQuery(''); setSelectedRole('ALL'); }}>
              Reset Filters
            </Button>
          </div>
        ) : (
          filteredSections.map((sec) => (
            <section
              key={sec.id}
              id={sec.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden scroll-mt-20 transition-all hover:border-slate-300"
            >
              {/* Section Header */}
              <div className="p-5 sm:p-6 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 uppercase tracking-wider">
                      {sec.badge}
                    </span>
                    <div className="flex items-center gap-1">
                      {sec.roles.map((r) => (
                        <span
                          key={r}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200/80 text-slate-700"
                        >
                          {r === 'SUPER_ADMIN' ? '👑 Super Admin' : r === 'STORE_ADMIN' ? '🏬 Warehouse Admin' : '🏗️ Project Admin'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">{sec.title}</h2>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">{sec.summary}</p>
                </div>

                {sec.directLink && (
                  <Link
                    href={sec.directLink.href}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs self-start sm:self-center transition-colors shrink-0"
                  >
                    <span>{sec.directLink.label}</span>
                    <span>↗</span>
                  </Link>
                )}
              </div>

              {/* Main Content: Simulated Software Screenshot with Numbered Markers */}
              <div className="p-5 sm:p-7 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                      <span>📸 Screen Walkthrough &amp; Visual Marker Callouts</span>
                    </h3>
                    <span className="text-[11px] text-slate-400">Click any marker pin to highlight details</span>
                  </div>

                  {/* Browser Window Mockup Container */}
                  <div className="rounded-xl border border-slate-300 bg-slate-900 shadow-md overflow-hidden">
                    {/* Window Title Bar */}
                    <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                        </div>
                        <span className="text-[11px] font-mono text-slate-300 ml-2 font-medium hidden sm:inline">
                          {sec.screenshot.title}
                        </span>
                      </div>

                      <div className="px-3 py-0.5 rounded-md bg-slate-900 text-slate-400 text-[10px] font-mono border border-slate-700 max-w-xs truncate">
                        {sec.screenshot.url}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Live IMS</span>
                      </div>
                    </div>

                    {/* Simulated Screen Interface Content */}
                    <div className="p-4 sm:p-6 bg-slate-100 text-slate-800 relative select-none">
                      {/* Render Screen Type */}
                      {renderScreenMockup(sec.id, sec.markers, activeMarker, (markerNum) => {
                        setActiveMarker(
                          activeMarker?.sectionId === sec.id && activeMarker.markerNum === markerNum
                            ? null
                            : { sectionId: sec.id, markerNum }
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Numbered Markers Legend & Detailed Callout Cards */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <span>Numbered Markers Legend &amp; Controls</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sec.markers.map((marker) => {
                      const isHighlighted = activeMarker?.sectionId === sec.id && activeMarker.markerNum === marker.number;

                      return (
                        <div
                          key={marker.number}
                          onClick={() => {
                            setActiveMarker(
                              isHighlighted ? null : { sectionId: sec.id, markerNum: marker.number }
                            );
                          }}
                          className={`p-3.5 rounded-xl border text-xs transition-all cursor-pointer flex gap-3 ${
                            isHighlighted
                              ? 'bg-blue-50/90 border-blue-400 ring-2 ring-blue-300 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="shrink-0">
                            <span
                              className={`w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs shadow-xs transition-transform ${
                                isHighlighted
                                  ? 'bg-blue-600 text-white scale-110'
                                  : 'bg-slate-800 text-white'
                              }`}
                            >
                              {marker.number}
                            </span>
                          </div>
                          <div className="space-y-1 min-w-0 flex-1">
                            <h5 className="font-bold text-slate-900 leading-tight flex items-center justify-between">
                              <span>{marker.label}</span>
                              {isHighlighted && (
                                <span className="text-[10px] text-blue-600 font-semibold">Active Marker</span>
                              )}
                            </h5>
                            <p className="text-slate-600 text-[11px] leading-relaxed">{marker.description}</p>
                            {marker.tip && (
                              <div className="mt-1.5 p-1.5 rounded bg-amber-50/80 border border-amber-200 text-amber-900 text-[10px] flex items-center gap-1.5">
                                <span>💡</span>
                                <span>{marker.tip}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Step-by-Step Procedure & Pro Tips */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                  {/* Step by Step */}
                  <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>📋 Standard Operating Procedure</span>
                    </h4>
                    <ol className="space-y-1.5 text-xs text-slate-700 list-decimal pl-4 leading-relaxed">
                      {sec.stepByStep.map((step, idx) => (
                        <li key={idx} className="pl-1">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Operational Invariants & Tips */}
                  <div className="space-y-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <h4 className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                      <span>🛡️ Invariants &amp; Best Practices</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-blue-900 list-disc pl-4 leading-relaxed">
                      {sec.proTips.map((tip, idx) => (
                        <li key={idx} className="pl-1">
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          ))
        )}
      </div>

      {/* Global Invariant Architecture Diagram */}
      <section className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg border border-slate-800 space-y-6">
        <div className="space-y-1.5">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            System Invariants
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            End-to-End Stock Ledger &amp; Transfer Lifecycle
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
            How inventory flows from external vendor receipts through central warehouses, transit dispatches, project manufacturing, and department consumptions.
          </p>
        </div>

        {/* Process Flow Diagram */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-400">Step 1: Inward</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">Stock In</span>
            </div>
            <h4 className="font-bold text-white text-sm">Vendor Receipt</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Goods arrive at central warehouse. Store Admin enters challan/invoice. Super Admin approves request. Stock booked to warehouse ledger.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-400">Step 2: Dispatch</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">Stock Out</span>
            </div>
            <h4 className="font-bold text-white text-sm">Project Allocation</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Warehouse creates project dispatch. Usable balance reserved. Super Admin signs off. Physical gate pass printed and transit shipment created.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-400">Step 3: Receipt</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">Shipment</span>
            </div>
            <h4 className="font-bold text-white text-sm">Site Verification</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Project Admin inspects physical packages. Clicks "Receive Stock" to credit project store. Any damaged boxes are flagged via Discrepancy.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-400">Step 4: Transform</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">BOM / Issues</span>
            </div>
            <h4 className="font-bold text-white text-sm">Manufacturing &amp; Issues</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Raw materials converted to finished products via Recipe BOM, or issued to hospital departments. Zero untracked shrinkage.
            </p>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions (FAQ) Accordion */}
      <section id="faq-section" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
            Troubleshooting &amp; Knowledge Base
          </span>
          <h2 className="text-xl font-bold text-slate-900">Frequently Asked Questions</h2>
          <p className="text-xs sm:text-sm text-slate-500">Quick answers to common operations and administrative questions.</p>
        </div>

        <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="py-4">
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 text-left font-bold text-xs sm:text-sm text-slate-900 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <span className="text-slate-400 font-mono text-sm shrink-0">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <p className="mt-2.5 text-xs text-slate-600 leading-relaxed pr-6">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/**
 * Helper to render interactive screen mockups with numbered marker callouts
 */
function renderScreenMockup(
  sectionId: string,
  markers: MarkerItem[],
  activeMarker: { sectionId: string; markerNum: number } | null,
  onMarkerClick: (markerNum: number) => void
) {
  // Marker pin component
  const MarkerPin = ({ num, className }: { num: number; className: string }) => {
    const isSelected = activeMarker?.sectionId === sectionId && activeMarker.markerNum === num;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMarkerClick(num);
        }}
        className={`absolute z-20 w-6 h-6 rounded-full font-extrabold text-[11px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
          isSelected
            ? 'bg-blue-600 text-white ring-4 ring-blue-300 scale-125 shadow-lg'
            : 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-110 shadow-md ring-2 ring-white'
        } ${className}`}
        title={`Marker ${num}: Click for details`}
      >
        {num}
      </button>
    );
  };

  switch (sectionId) {
    case 'system-navigation':
      return (
        <div className="space-y-4 font-sans text-xs">
          <div className="bg-slate-900 text-white p-3 rounded-lg flex items-center justify-between relative shadow-sm">
            <div className="flex items-center gap-3">
              <div className="px-2 py-1 rounded bg-blue-600 font-bold text-[10px]">LABCO WMS</div>
              <div className="relative">
                <span className="font-semibold text-white">Daily Operations</span>
                <MarkerPin num={1} className="-top-3 -right-6" />
              </div>
              <span className="text-slate-400">/</span>
              <div className="relative">
                <span className="text-slate-300">Vikas Nagar Office (Central Warehouse)</span>
                <MarkerPin num={2} className="-top-3 -right-6" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="px-2 py-1 rounded bg-slate-800 text-amber-300 text-[10px] font-semibold flex items-center gap-1">
                  <span>🔔</span>
                  <span>3 Pending Approvals</span>
                </span>
                <MarkerPin num={3} className="-top-2 -right-4" />
              </div>
              <div className="relative">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 border border-slate-700">
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-[10px] flex items-center justify-center font-bold">SA</span>
                  <span className="text-[11px] font-semibold">Super Admin</span>
                </div>
                <MarkerPin num={4} className="-top-2 -right-4" />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs grid grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
              <div className="font-bold text-slate-800 text-lg">1,400 kg</div>
              <div className="text-[10px] text-slate-500">Warehouse Raw Cotton</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <div className="font-bold text-slate-800 text-lg">12</div>
              <div className="text-[10px] text-slate-500">Active Projects</div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
              <div className="font-bold text-slate-800 text-lg">5</div>
              <div className="text-[10px] text-slate-500">Shipments In Transit</div>
            </div>
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
              <div className="font-bold text-slate-800 text-lg">100%</div>
              <div className="text-[10px] text-slate-500">Audit Compliance</div>
            </div>
          </div>
        </div>
      );

    case 'catalog-management':
      return (
        <div className="space-y-3 font-sans text-xs">
          {/* Action Toolbar */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-sm">Product Catalog</span>
              <span className="text-[10px] text-slate-500">(1 Raw Material, 20 Categories)</span>
            </div>
            <div className="relative flex items-center gap-2">
              <button className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold text-[11px]">
                + Raw Material
              </button>
              <button className="px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-700 text-[11px]">
                + Add Category
              </button>
              <MarkerPin num={5} className="-top-3 -right-3" />
            </div>
          </div>

          {/* Catalog Table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold">
                <tr>
                  <th className="p-2.5">Product &amp; SKU</th>
                  <th className="p-2.5">Category / Hierarchy</th>
                  <th className="p-2.5">Brand</th>
                  <th className="p-2.5">Active Units</th>
                  <th className="p-2.5">Warehouse Stock</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr className="hover:bg-slate-50/70">
                  <td className="p-2.5 font-semibold text-slate-900">
                    <div>Cotton 200gsm</div>
                    <span className="text-[10px] text-slate-400 font-mono">RM-COTTON-200</span>
                  </td>
                  <td className="p-2.5 relative">
                    <div className="text-[11px] font-medium text-slate-900">Cotton</div>
                    <div className="text-[10px] text-slate-500">↳ Cotton 200GSM</div>
                    <MarkerPin num={1} className="-top-1 -left-2" />
                  </td>
                  <td className="p-2.5 relative">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">Labco</span>
                    <MarkerPin num={2} className="-top-1 -right-2" />
                  </td>
                  <td className="p-2.5 relative">
                    <div className="font-semibold text-slate-900">Kilogram (kg) [Base]</div>
                    <div className="text-[10px] text-slate-400">Roll = 50 kg</div>
                    <MarkerPin num={3} className="-top-1 -left-2" />
                  </td>
                  <td className="p-2.5 relative">
                    <div className="font-bold text-emerald-700">1,400 Kilogram (kg)</div>
                    <span className="text-[10px] text-slate-400">Central Warehouse only</span>
                    <MarkerPin num={4} className="-top-1 -right-2" />
                  </td>
                  <td className="p-2.5 text-right">
                    <span className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[10px] cursor-pointer">
                      Inspect
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'stock-in':
      return (
        <div className="space-y-3 font-sans text-xs bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-bold text-slate-900 text-sm">Step 1: Inbound Vendor Stock In</span>
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
              Requires Super Admin Sign-off
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="relative p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Destination Warehouse</label>
              <div className="font-semibold text-slate-800">Vikas Nagar Office (Central Warehouse)</div>
              <MarkerPin num={1} className="-top-2 -right-2" />
            </div>

            <div className="relative p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Vendor &amp; Invoice Reference</label>
              <div className="font-semibold text-slate-800">Apex Medical Suppliers • Inv #INV-2026-991</div>
              <MarkerPin num={4} className="-top-2 -right-2" />
            </div>
          </div>

          {/* Line item box */}
          <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800">Line #1: Select Product &amp; Unit Conversion</span>
              <span className="text-[10px] text-blue-700 font-semibold">1,000 kg calculated base stock</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="relative col-span-2">
                <input
                  type="text"
                  readOnly
                  value="Cotton 200gsm (Labco) — In Stock: 1,400 kg"
                  className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-[11px] font-medium"
                />
                <MarkerPin num={2} className="-top-2 -left-2" />
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value="20 Rolls (= 1,000 kg)"
                  className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-[11px] font-bold text-blue-700"
                />
                <MarkerPin num={3} className="-top-2 -right-2" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-500">Total lines: 1 item • 1,000 kg</span>
            <div className="relative">
              <button className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-xs">
                Submit Request for Super Admin Approval
              </button>
              <MarkerPin num={5} className="-top-2 -right-2" />
            </div>
          </div>
        </div>
      );

    case 'project-dispatches':
      return (
        <div className="space-y-3 font-sans text-xs bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="relative">
              <div className="font-bold text-slate-900 text-sm">Shipment #SHP-2026-0041 • Vikas Nagar → RML Lucknow</div>
              <div className="text-[11px] text-slate-500">Challan: CH-LKO-8842 • Carrier: BlueDart Logistics</div>
              <MarkerPin num={1} className="-top-1 -left-3" />
            </div>
            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
              IN_TRANSIT
            </span>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold">
                <tr>
                  <th className="p-2">Item Description</th>
                  <th className="p-2">Dispatched Qty</th>
                  <th className="p-2">Expected at Site</th>
                  <th className="p-2 text-right">Verification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-2 font-semibold text-slate-800">Cotton 200gsm (Labco)</td>
                  <td className="p-2 relative font-bold text-slate-900">
                    300 Kilogram (kg)
                    <MarkerPin num={2} className="-top-1 -right-2" />
                  </td>
                  <td className="p-2 text-slate-700">300 Kilogram (kg)</td>
                  <td className="p-2 text-right text-amber-600 font-medium text-[11px]">Pending Physical Arrival</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="relative">
              <button className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold text-[11px] hover:bg-slate-50">
                🖨️ Print Gate Pass Challan
              </button>
              <MarkerPin num={5} className="-top-2 -right-2" />
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-[11px] hover:bg-rose-100">
                  ⚠️ Report Discrepancy / Damaged
                </button>
                <MarkerPin num={4} className="-top-2 -right-2" />
              </div>
              <div className="relative">
                <button className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-500 shadow-xs">
                  ✅ Receive Stock into Project
                </button>
                <MarkerPin num={3} className="-top-2 -right-2" />
              </div>
            </div>
          </div>
        </div>
      );

    case 'transfer-catalog':
      return (
        <div className="space-y-3 font-sans text-xs bg-white p-4 rounded-xl border border-slate-300 shadow-md">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <span className="font-bold text-slate-900 text-sm">Transfer Catalog to RML Lucknow</span>
              <p className="text-[10px] text-slate-500">Seed company categories and products directly into project</p>
            </div>
            <div className="relative">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
                19 Categories, 1 Product Selected
              </span>
              <MarkerPin num={4} className="-top-2 -right-2" />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <div className="relative flex items-center gap-2 font-semibold">
              <span className="px-2.5 py-1 bg-slate-900 text-white rounded">Select by Category (19)</span>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded">Select by Product (1)</span>
              <MarkerPin num={3} className="-top-2 -right-2" />
            </div>
            <div className="relative flex items-center gap-2 text-blue-600 font-semibold cursor-pointer">
              <span>Select All Categories</span>
              <span>•</span>
              <span className="text-slate-400">Deselect All</span>
              <MarkerPin num={2} className="-top-2 -right-2" />
            </div>
          </div>

          {/* Category Tree View */}
          <div className="p-2 border border-slate-200 rounded-lg max-h-36 overflow-y-auto space-y-1 bg-slate-50/50">
            <div className="relative flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                <span>📁 Cotton (1 item)</span>
              </label>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">1 / 1 selected</span>
              <MarkerPin num={1} className="-top-1 -left-2" />
            </div>
            <div className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                <span>📁 Bandage (0 items)</span>
              </label>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">Category Selected</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-[11px] text-slate-500">19 categories and 1 product selected</span>
            <div className="relative">
              <button className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-xs">
                Transfer 19 Categories &amp; 1 Products
              </button>
              <MarkerPin num={5} className="-top-2 -right-2" />
            </div>
          </div>
        </div>
      );

    case 'manufacturing-bom':
      return (
        <div className="space-y-3 font-sans text-xs bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="relative">
              <div className="font-bold text-slate-900 text-sm">BOM Production Run #PR-2026-012</div>
              <div className="text-[10px] text-slate-500">Output Target: 500 Roll • Gauze Thaan (Finished Product)</div>
              <MarkerPin num={1} className="-top-1 -left-2" />
            </div>
            <span className="px-2.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px]">
              Ready to Produce
            </span>
          </div>

          {/* BOM Sufficiency Check */}
          <div className="relative p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 text-[11px]">Component Sufficiency Analysis</span>
              <span className="text-emerald-700 font-bold text-[10px]">✅ Stock Sufficient (1,400 kg Available)</span>
            </div>
            <div className="p-2 rounded bg-white border border-slate-200 flex items-center justify-between">
              <span>Required: Cotton 200gsm (Raw Material)</span>
              <span className="font-mono font-bold text-slate-900">250 Kilogram (kg)</span>
            </div>
            <MarkerPin num={2} className="-top-2 -right-2" />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="relative">
              <button className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-xs">
                ▶ Start Batch Run &amp; Reserve Stock
              </button>
              <MarkerPin num={3} className="-top-2 -right-2" />
            </div>

            <div className="relative">
              <button className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-xs">
                Inspect Output &amp; Complete Run
              </button>
              <MarkerPin num={4} className="-top-2 -right-2" />
            </div>
          </div>
        </div>
      );

    case 'departments-consumption':
      return (
        <div className="space-y-3 font-sans text-xs bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-bold text-slate-900 text-sm">Department Issue Requisition Voucher #VCH-2026-081</span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
              Authorized Issue
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="relative p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Receiving Department</label>
              <div className="font-semibold text-slate-800">Quality Control &amp; Testing Lab</div>
              <MarkerPin num={1} className="-top-2 -right-2" />
            </div>

            <div className="relative p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Requisition Purpose</label>
              <div className="font-semibold text-slate-800">Batch Inspection Sample Testing</div>
              <MarkerPin num={2} className="-top-2 -right-2" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="relative">
              <button className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-xs">
                Authorize Issue Voucher
              </button>
              <MarkerPin num={3} className="-top-2 -right-2" />
            </div>

            <div className="relative">
              <button className="px-3.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-200">
                Record Department Unused Return
              </button>
              <MarkerPin num={4} className="-top-2 -right-2" />
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
