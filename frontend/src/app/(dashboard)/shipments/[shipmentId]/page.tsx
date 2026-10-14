import { ShipmentDetailView } from '@/features/shipments/components/ShipmentDetailView';

export const metadata = {
  title: 'Shipment Tracking Details | Labco Operations',
};

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  return <ShipmentDetailView shipmentId={shipmentId} />;
}
