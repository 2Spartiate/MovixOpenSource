import type { StreamedPlaybackChoice, StreamedServerChoice } from '../types/streamed';

export function buildStreamedPlaybackChoices<T extends StreamedPlaybackChoice>(streams: T[], native: boolean, labels: { embed: string; native: string }): T[] {
  return streams.flatMap(stream => {
    if (!stream._streamedKey) return [stream];
    const embed = { ...stream, _streamedTitle: stream.title, title: `${labels.embed} · ${stream.title}` };
    if (!native) return [embed];
    // LiveTVPlayer ouvre l'index 0 : avec l'extension/VIP, il doit déclencher
    // la résolution native du premier serveur dès l'ouverture du match.
    return [{
      ...stream, _streamedTitle: stream.title, title: `${labels.native} · ${stream.title}`, _isEmbed: false,
      _streamedNative: { key: stream._streamedKey, embedUrl: stream.url },
    }, embed];
  });
}

/** Une ligne par serveur ; les index continuent de désigner les vrais flux. */
export function getStreamedServerChoices(streams: StreamedPlaybackChoice[]): StreamedServerChoice[] {
  const servers = new Map<string, StreamedServerChoice>();
  streams.forEach((stream, index) => {
    if (!stream._streamedKey) return;
    const server: StreamedServerChoice = servers.get(stream._streamedKey) ?? {
      key: stream._streamedKey, title: stream._streamedTitle ?? stream.title,
    };
    if (stream._isEmbed) server.embedIndex = index;
    else if (stream._streamedNative) server.nativeIndex = index;
    servers.set(server.key, server);
  });
  return [...servers.values()];
}

// Les langues de l'API sont des noms anglais ; les libellés viennent de l'i18n.
const LANGUAGE_CODES: Record<string, string> = {
  french: 'fr', français: 'fr', francais: 'fr', english: 'en', spanish: 'es',
  german: 'de', italian: 'it', portuguese: 'pt', arabic: 'ar', dutch: 'nl',
  turkish: 'tr', russian: 'ru', polish: 'pl', hindi: 'hi', chinese: 'zh',
  japanese: 'ja', korean: 'ko', swedish: 'sv', norwegian: 'no', danish: 'da',
};

export function getStreamedServerDetails(title: string) {
  const match = title.match(/^[^·]+ · \d+(?: · (.*?))? · (HD|SD)$/i);
  if (!match) return { language: '', languageCode: '', broadcaster: title, quality: '' };
  const [language = '', ...broadcaster] = (match[1] ?? '').split(/\s+-\s+/);
  const normalized = language.toLowerCase();
  return {
    language,
    languageCode: LANGUAGE_CODES[normalized] ?? (/^[a-z]{2}$/.test(normalized) ? normalized : ''),
    broadcaster: broadcaster.join(' - '),
    quality: match[2].toUpperCase(),
  };
}

// Même sélection que Main API : les variantes Streamed ne partagent pas
// nécessairement leur horloge MPEG-TS. L'ABR peut bloquer après le passage en HD.
export function selectStreamedVariant(text: string): string {
  const lines = text.split('\n');
  const variants: { tag: number; bitrate: number; uri: number }[] = [];
  let pending: { tag: number; bitrate: number } | undefined;
  lines.forEach((line, index) => {
    const value = line.trim();
    if (value.startsWith('#EXT-X-STREAM-INF:')) {
      pending = { tag: index, bitrate: Number(/(?:^|,)BANDWIDTH=(\d+)(?:,|$)/.exec(value.slice(18))?.[1]) || 0 };
    } else if (value && !value.startsWith('#') && pending) {
      variants.push({ ...pending, uri: index });
      pending = undefined;
    }
  });
  if (variants.length < 2) return text;
  const selected = variants.reduce((best, variant) => variant.bitrate > best.bitrate ? variant : best);
  const removed = new Set(variants.filter(variant => variant !== selected).flatMap(variant => [variant.tag, variant.uri]));
  return lines.filter((_, index) => !removed.has(index)).join('\n');
}

export function unwrapStreamedBytes(bytes: Uint8Array): Uint8Array {
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!png && !webp) return bytes;
  for (let offset = 0; offset < Math.min(bytes.length - 188, 65536); offset++) {
    if (bytes[offset] === 0x47 && bytes[offset + 188] === 0x47 &&
      (offset + 376 >= bytes.length || bytes[offset + 376] === 0x47)) return bytes.slice(offset);
  }
  throw new Error('Segment Streamed invalide');
}
