import { Suspense } from 'react';
import PreviewRenderer from '@/components/PreviewRenderer';

export default function PreviewPage() {
  return (
    <Suspense fallback={null}>
      <PreviewRenderer />
    </Suspense>
  );
}
