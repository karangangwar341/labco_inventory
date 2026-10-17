import { CatalogProductForm } from '@/features/catalog/components/CatalogProductForm';

export const metadata = { title: 'Add Product | Labco Operations' };

export default async function NewCatalogProductPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const params = await searchParams;
  const initialKind = params.kind === 'MANUFACTURED_PRODUCT' ? 'MANUFACTURED_PRODUCT' : 'RAW_MATERIAL';
  return <CatalogProductForm initialKind={initialKind} />;
}
