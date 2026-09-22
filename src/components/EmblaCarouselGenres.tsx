import { useLightMode } from '@/context/LightModeContext';
import React, { useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { PrefetchLink as Link } from '@/routing/PrefetchLink';

interface GenreItem {
  id: number | string;
  name: string;
  route: string;
  imageUrl?: string;
}

interface EmblaCarouselGenresProps {
  title?: string | React.ReactNode;
  items: GenreItem[];
}

const EmblaCarouselGenres: React.FC<EmblaCarouselGenresProps> = ({ title, items }) => {
  const { effectivePrefs } = useLightMode();
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    dragFree: true,
    containScroll: 'keepSnaps',
    slidesToScroll: 1,
    skipSnaps: false,
    duration: effectivePrefs.transitions ? 25 : 0,
    loop: false
  });
  const handleTVFocus = useCallback((index: number) => {
    if (!(window as any).MOVIX_TV || !emblaApi) return;
    try {
      emblaApi.scrollTo(index, !effectivePrefs.transitions);
    } catch {
      // Le runtime spatial conserve scrollIntoView comme repli.
    }
  }, [emblaApi, effectivePrefs.transitions]);

  return (
    <div className="w-full relative" data-tv-focus-group="carousel-row" data-tv-carousel-row>
      {title && (
        <div className="flex justify-between items-center mb-2 px-4 md:px-6 relative z-10">
          <h2 className="section-title">{title}</h2>
        </div>
      )}
      <div className="relative w-full">
        <div className="overflow-visible" ref={emblaRef}>
          <div className="flex gap-4 md:gap-6 pr-4 md:pr-6 py-4 pl-4 md:pl-6">
            {items.map((genre, index) => (
              <div key={genre.id} className="flex-none">
                <Link to={genre.route} data-tv-focus data-tv-card onFocus={() => handleTVFocus(index)} className="block w-[180px] h-[100px] md:w-[220px] md:h-[120px] group select-none">
                  <div className="w-full h-full relative rounded-xl overflow-hidden bg-gradient-to-br from-red-600/20 to-red-400/10 ring-1 ring-white/10">
                    {genre.imageUrl && (
                      <img
                        src={genre.imageUrl}
                        alt={genre.name}
                        className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity duration-300"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-colors" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white font-semibold text-base md:text-lg tracking-wide drop-shadow-md">
                        {genre.name}
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
            <div className="flex-none w-8 md:w-24" aria-hidden="true" />
          </div>
        </div>

      </div>
    </div>
  );
};

export default React.memo(EmblaCarouselGenres);
