import { UserGuideView } from '@/features/help/components/UserGuideView';

export const metadata = {
  title: 'Software Guide & Manual | Labco WMS',
  description: 'Complete user manual with annotated screenshots, workflow walk-throughs, and operational guidelines.',
};

export default function HelpPage() {
  return <UserGuideView />;
}
