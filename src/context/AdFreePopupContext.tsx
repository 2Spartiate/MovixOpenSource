import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { checkVipStatus, isUserVip } from '../utils/vipUtils';


interface AdFreePopupContextType {
  showAdFreePopup: boolean;
  adType: 'ad1' | 'ad2';
  playerToShow: string | null;
  shouldLoadIframe: boolean;
  isSpecialPlayer: boolean;
  isVoVostfrOnly: boolean;
  is_vip: boolean;
  showPopupForPlayer: (playerType: string, additionalInfo?: any) => void;
  handlePopupClose: () => void;
  handlePopupAccept: () => void;
  resetVipStatus: () => void;
}

const AdFreePopupContext = createContext<AdFreePopupContextType | undefined>(undefined);

export const AdFreePopupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showAdFreePopup, setShowAdFreePopup] = useState(false);
  const [adType, setAdType] = useState<'ad1' | 'ad2'>('ad2');
  const [playerToShow, setPlayerToShow] = useState<string | null>(null);
  const [shouldLoadIframe, setShouldLoadIframe] = useState(true);
  const [isSpecialPlayer, setIsSpecialPlayer] = useState(false);
  const [isVoVostfrOnly, setIsVoVostfrOnly] = useState(false);
  const [is_vip, setIsVip] = useState(() => {
    // Check VIP status via server-verified utility
    return isUserVip();
  });

  // Effect to listen for changes to VIP status (localStorage + custom events)
  useEffect(() => {
    let mounted = true;

    const syncVipStatus = () => {
      if (mounted) setIsVip(isUserVip());
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'is_vip') {
        setIsVip(e.newValue === 'true');
      }
    };

    const handleVipStatusChanged = () => {
      setIsVip(isUserVip());
    };

    // La vÃ©rification lancÃ©e au dÃ©marrage peut finir avant le montage de ce
    // provider. On relit donc l'Ã©tat, puis on rejoint sa requÃªte en cours afin
    // de ne jamais rester bloquÃ© avec la valeur initiale aprÃ¨s une connexion.
    syncVipStatus();
    if (localStorage.getItem('access_code')) {
      void checkVipStatus().then((vip) => {
        if (mounted) setIsVip(vip);
      });
    }

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('vipStatusChanged', handleVipStatusChanged);
    return () => {
      mounted = false;
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('vipStatusChanged', handleVipStatusChanged);
    };
  }, []);

  // L'acceptation de la popup n'est valable que « le temps de la session »
  // (`handlePopupAccept` monte `is_vip` en mémoire, sans rien écrire dans
  // localStorage). Tant que le changement d'épisode rechargeait le document,
  // ce provider était remonté à chaque épisode : l'acceptation retombait
  // toute seule et la popup revenait. Depuis le passage en navigation SPA
  // (nécessaire pour garder le plein écran d'un épisode à l'autre), le
  // provider survit à la navigation — l'acceptation ne retombait donc plus
  // jamais et plus aucune popup n'apparaissait après la première du chargement.
  //
  // On rejoue ici, à la main, ce que faisait le rechargement : à chaque
  // changement de route, l'état de session repart de zéro et `is_vip` est
  // relu depuis sa source de vérité (localStorage, donc un vrai VIP reste VIP).
  // Le premier rendu ne réinitialise rien : il n'y a rien à annuler.
  const { pathname } = useLocation();
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    setShowAdFreePopup(false);
    setPlayerToShow(null);
    setShouldLoadIframe(true);
    setIsSpecialPlayer(false);
    setIsVoVostfrOnly(false);
    setIsVip(isUserVip());
  }, [pathname]);

  const showPopupForPlayer = useCallback((_playerType: string, _additionalInfo?: any) => {
    // Advertising gates are disabled for every Movix app runtime.
    // Keep VIP state independent: premium server-side capabilities must still
    // require their real access code instead of inheriting an ad bypass.
    setShowAdFreePopup(false);
    setPlayerToShow(null);
    setShouldLoadIframe(true);
    setIsSpecialPlayer(false);
    setIsVoVostfrOnly(false);
  }, []);

  const handlePopupClose = useCallback(() => {
    setShowAdFreePopup(false);
    setPlayerToShow(null);
  }, []);

  const handlePopupAccept = useCallback(() => {
    setShowAdFreePopup(false);
    setIsVip(true);
    setShouldLoadIframe(true);
    // Don't set localStorage here - this is temporary for the session only
    try {
      const evt = new CustomEvent('ad_popup_accepted', { detail: { timestamp: Date.now() } });
      window.dispatchEvent(evt);
    } catch { }
  }, []);

  const resetVipStatus = useCallback(() => {
    // Don't reset if localStorage has permanent VIP status
    if (localStorage.getItem('is_vip') !== 'true') {
      setIsVip(false);
      console.log('[AdFreePopupContext] VIP status reset.');
    }
  }, []);

  // Memoize the context value so the 7 consumers (Movie/TVDetails, Watch
  // pages, MovieVideoPlayer, AdFreePlayerAds) don't re-render on every parent
  // render. AdFreePopupProvider sits near the root of the App provider stack,
  // so anything its parents re-render for (route changes, auth ticks) used to
  // cascade into the heavy detail pages via this provider. — perf
  const value = useMemo<AdFreePopupContextType>(() => ({
    showAdFreePopup,
    adType,
    playerToShow,
    shouldLoadIframe,
    isSpecialPlayer,
    isVoVostfrOnly,
    is_vip,
    showPopupForPlayer,
    handlePopupClose,
    handlePopupAccept,
    resetVipStatus
  }), [
    showAdFreePopup,
    adType,
    playerToShow,
    shouldLoadIframe,
    isSpecialPlayer,
    isVoVostfrOnly,
    is_vip,
    showPopupForPlayer,
    handlePopupClose,
    handlePopupAccept,
    resetVipStatus
  ]);

  return (
    <AdFreePopupContext.Provider value={value}>
      {children}
    </AdFreePopupContext.Provider>
  );
};

export const useAdFreePopup = () => {
  const context = useContext(AdFreePopupContext);
  if (context === undefined) {
    throw new Error('useAdFreePopup must be used within an AdFreePopupProvider');
  }
  return context;
};
