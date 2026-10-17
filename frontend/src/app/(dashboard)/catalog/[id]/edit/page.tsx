import { CatalogProductForm } from '@/features/catalog/components/CatalogProductForm';

export const metadata = { title: 'Edit Product | Labco Operations' };

export default async function EditCatalogProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CatalogProductForm productId={id} />;
}
