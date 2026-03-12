import { Suspense } from 'react';
import SlideRenderer from '@/components/SlideRenderer';

export default function SlidesPage() {
  return (
    <Suspense fallback={null}>
      <SlideRenderer />
    </Suspense>
  );
}
