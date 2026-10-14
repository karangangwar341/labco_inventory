import { RequestDetailView } from '@/features/requests/components/RequestDetailView';

export const metadata = {
  title: 'Request Details | Labco Operations',
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return <RequestDetailView requestId={requestId} />;
}
