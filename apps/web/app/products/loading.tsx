import { ProductGridSkeleton } from '@/components/SkeletonLoader';

export default function Loading() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
      <div
        style={{
          height: '34px',
          width: '220px',
          backgroundColor: '#f0f0f0',
          borderRadius: '6px',
          marginBottom: '28px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
