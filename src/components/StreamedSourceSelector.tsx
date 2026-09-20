import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StreamedPlaybackChoice } from '@/types/streamed';
import { getStreamedServerChoices, getStreamedServerDetails } from '@/utils/streamedPlayback';

interface Props {
    streams: StreamedPlaybackChoice[];
    currentStreamIndex: number;
    onChange: (index: number) => void;
}

export default function StreamedSourceSelector({ streams, currentStreamIndex, onChange }: Props) {
    const { t } = useTranslation();
    const servers = getStreamedServerChoices(streams);
    // Parcourir un mode ne change pas le flux : seul le choix d'un serveur le lance.
    const [viewingNative, setViewingNative] = useState(!!streams[currentStreamIndex]?._streamedNative);
    const canChoosePlayer = servers.some(server => server.nativeIndex !== undefined)
        && servers.some(server => server.embedIndex !== undefined);

    return (
        <div className="space-y-6 p-4">
            {canChoosePlayer && (
                <fieldset className="min-w-0">
                    <legend className="float-left mb-3 w-full text-sm font-semibold text-white">{t('liveTV.streamedPlayer')}</legend>
                    <div className="clear-both grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1">
                        {([
                            { native: true, label: t('liveTV.streamedMovixOption'), name: t('liveTV.streamedNativePlayer') },
                            { native: false, label: t('liveTV.streamedEmbedOption'), name: t('liveTV.streamedEmbedPlayer') },
                        ]).map(option => (
                            <button
                                key={option.name}
                                type="button"
                                aria-label={option.name}
                                aria-pressed={viewingNative === option.native}
                                onClick={() => setViewingNative(option.native)}
                                className={`min-h-11 rounded-md px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${viewingNative === option.native ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-gray-400">
                        {t(viewingNative ? 'liveTV.streamedMovixHint' : 'liveTV.streamedEmbedHint')}
                    </p>
                </fieldset>
            )}
            <div className={canChoosePlayer ? 'border-t border-white/10 pt-5' : undefined}>
                <p className="mb-3 text-sm leading-relaxed text-gray-400">{t('liveTV.streamedServerHint')}</p>
                <div role="group" aria-label={t('liveTV.streamedServers')} className="space-y-1">
                    {servers.map((server, index) => {
                        const target = viewingNative ? server.nativeIndex : server.embedIndex;
                        if (target === undefined) return null;
                        const active = target === currentStreamIndex;
                        const details = getStreamedServerDetails(server.title);
                        const language = details.languageCode
                            ? t(`languages.${details.languageCode}`, { defaultValue: details.language })
                            : details.language;
                        return (
                            <button
                                key={server.key}
                                type="button"
                                aria-pressed={active}
                                onClick={() => onChange(target)}
                                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400 ${active ? 'bg-red-600/20 text-red-300' : 'text-white hover:bg-white/5'}`}
                            >
                                <div className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold">{t('liveTV.streamedServerNumber', { number: index + 1 })}</span>
                                    {(language || details.broadcaster) && (
                                        <span className={`mt-1 block break-words text-xs leading-relaxed ${active ? 'text-red-100/80' : 'text-gray-400'}`}>
                                            {[language, details.broadcaster].filter(Boolean).join(' · ')}
                                        </span>
                                    )}
                                </div>
                                {details.quality && <span className="shrink-0 text-xs font-medium">{details.quality}</span>}
                                <span className="flex w-4 shrink-0 justify-center" aria-hidden="true">{active && <Check size={16} />}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
