import type { ReactNode } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';

function GuideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-[#dbe3ee] py-5 last:border-0">
      <h2 className="text-base font-semibold text-[#172033]">{title}</h2>
      {children}
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="How to use the stock system" description="Short steps for the most common tasks." />

      <div className="flex flex-wrap gap-2">
        <Link href="/requests/new?type=STOCK_IN"><Button variant="secondary">Start stock in</Button></Link>
        <Link href="/requests/new?type=STOCK_OUT"><Button variant="primary">Start stock out</Button></Link>
      </div>

      <div className="divide-y divide-[#dbe3ee] rounded-lg border border-[#dbe3ee] bg-white px-5">
        <GuideSection title="Add stock">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#5b6678]">
            <li>Choose <strong className="text-[#172033]">Stock in</strong>.</li>
            <li>Choose the location, product, quantity, and unit.</li>
            <li>Enter the lot number or expiry date if the form asks for it.</li>
            <li>Choose where the stock came from, then send the request for approval.</li>
          </ol>
        </GuideSection>

        <GuideSection title="Remove or send stock">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#5b6678]">
            <li>Choose <strong className="text-[#172033]">Stock out</strong>.</li>
            <li>Choose the product, quantity, and unit. Warehouse users also choose the client receiving the stock.</li>
            <li>Send the request for approval. Requested stock is held while the request is reviewed.</li>
          </ol>
        </GuideSection>

        <GuideSection title="What happens after you send it">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#5b6678]">
            <li><strong className="text-[#172033]">In progress:</strong> the request is waiting for a Super Admin.</li>
            <li><strong className="text-[#172033]">Approved:</strong> the stock change is recorded. A delivery may still need to be received.</li>
            <li><strong className="text-[#172033]">Rejected:</strong> open the request to read the reason, then correct and send a new request.</li>
            <li><strong className="text-[#172033]">Draft:</strong> the request was saved but not sent. Open it and choose “Send for approval”.</li>
          </ul>
          <Link href="/requests" className="inline-block text-sm font-medium text-[#2563eb] hover:underline">Check my requests</Link>
        </GuideSection>

        <GuideSection title="If something is missing">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#5b6678]">
            <li><strong className="text-[#172033]">No product:</strong> ask an administrator to add or approve it.</li>
            <li><strong className="text-[#172033]">No location:</strong> ask an administrator to check your account assignment.</li>
            <li><strong className="text-[#172033]">Lot or expiry requested:</strong> enter the details shown on the item. Some products require them.</li>
            <li><strong className="text-[#172033]">Not enough stock:</strong> lower the quantity or ask an administrator to review the available stock.</li>
          </ul>
        </GuideSection>

        <GuideSection title="Other work">
          <p className="text-sm leading-6 text-[#5b6678]">
            Product setup, transfers, stock counts, shipments, departments, manufacturing, imports, and reports are grouped under <strong className="text-[#172033]">More</strong> in the menu. Your role controls which pages are available.
          </p>
        </GuideSection>
      </div>
    </div>
  );
}
