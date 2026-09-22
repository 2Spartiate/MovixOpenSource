import { useLightMode } from '@/context/LightModeContext';
import React, { useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { PrefetchLink as Link } from '@/routing/PrefetchLink';

interface PlatformItem {
  id: number;
  src: string;
  alt: string;
  video?: string;
  route: string;
  label?: string;
}

interface EmblaCarouselPlatformsProps {
  title?: string | React.ReactNode;
  items: PlatformItem[];
}

const EmblaCarouselPlatforms: React.FC<EmblaCarouselPlatformsProps> = ({ title, items }) => {
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
    <div className="w-full relative -mx-3 md:-mx-4" data-tv-focus-group="carousel-row" data-tv-carousel-row>
      {title && (
        <div className="flex justify-between items-center mb-2 px-4 md:px-6 relative z-10">
          <h2 className="section-title">{title}</h2>
        </div>
      )}
      <div className="relative w-full">
        <div className="overflow-visible" ref={emblaRef}>
          <div className="flex gap-6 pr-8 md:pr-16 py-8 pl-4 md:pl-6">
            {items.map((platform, index) => (
              <div key={platform.id} className="flex-none">
                <Link to={platform.route} data-tv-focus data-tv-card onFocus={() => handleTVFocus(index)} className="platform-link block w-[250px] h-[150px] group select-none">
                  <div
                    className="w-full h-full relative bg-white rounded-xl"
                    onMouseEnter={() => {
                      if (!effectivePrefs.bgAnimations) return;
                      if (!platform.video?.endsWith('.gif')) {
                        const video = document.getElementById(`video-${platform.id}`) as HTMLVideoElement | null;
                        if (video) {
                          try {
                            // preload="none" : rien n'est téléchargé au mount (~2,4 Mo
                            // économisés sur la Home). On ne déclenche le chargement
                            // qu'au tout premier survol, une seule fois (dataset flag
                            // pour ne pas relancer un fetch réseau aux survols suivants).
                            if (!video.dataset.loaded) {
                              video.dataset.loaded = 'true';
                              video.load();
                            }
                            video.currentTime = 0;
                            video.play().catch(() => {});
                          } catch (_) {}
                        }
                      }
                    }}
                    onMouseLeave={() => {
                      if (!platform.video?.endsWith('.gif')) {
                        const video = document.getElementById(`video-${platform.id}`) as HTMLVideoElement | null;
                        if (video) {
                          try { video.pause(); video.currentTime = 0; } catch (_) {}
                        }
                      }
                    }}
                  >
                    <img
                      src={platform.src}
                      alt={platform.alt}
                      className={`w-full h-full object-contain p-8 ${effectivePrefs.bgAnimations && platform.video ? 'group-hover:opacity-0 transition-opacity duration-300' : ''}`}
                      draggable="false"
                      loading="lazy"
                      decoding="async"
                    />
                    {platform.label && (
                      <p className="absolute bottom-2 left-0 right-0 text-center text-white text-xs font-bold bg-black/60 py-1 px-2 mx-4 rounded-lg">
                        {platform.label}
                      </p>
                    )}
                    {effectivePrefs.bgAnimations && platform.video && (
                      platform.video.endsWith('.gif') ? (
                        <img
                          id={`video-${platform.id}`}
                          src={platform.video}
                          alt={platform.alt}
                          className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
                        />
                      ) : (
                        <video
                          id={`video-${platform.id}`}
                          className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
                          loop
                          muted
                          playsInline
                          preload="none"
                        >
                          <source src={platform.video} type="video/mp4" />
                        </video>
                      )
                    )}
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

export default React.memo(EmblaCarouselPlatforms);

