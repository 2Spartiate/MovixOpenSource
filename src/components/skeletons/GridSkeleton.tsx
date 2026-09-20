import React from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLightMode } from '@/context/LightModeContext';
import { LightweightLoading } from '@/components/LightweightLoading';

const GridSkeleton: React.FC = () => {
  const { isLightMode } = useLightMode();
  if (isLightMode) return <LightweightLoading className="min-h-[200px]" />;
  return (
    <div className="flex flex-wrap gap-4 sm:gap-5 animate-skeleton-fade">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex-none w-32 md:w-48">
          <Skeleton variant="poster" width="100%" />
        </div>
      ))}
    </div>
  );
};

export default GridSkeleton;
