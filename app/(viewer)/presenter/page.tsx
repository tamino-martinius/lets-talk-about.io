import { Suspense } from 'react';
import PresenterRenderer from '@/components/PresenterRenderer';

export default function PresenterPage() {
  return (
    <Suspense fallback={null}>
      <PresenterRenderer />
    </Suspense>
  );
}
