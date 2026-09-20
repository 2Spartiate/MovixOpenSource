export interface StreamedNativeSource {
  key: string;
  embedUrl: string;
}

export interface StreamedPlaybackChoice {
  url: string;
  title: string;
  _isEmbed?: boolean;
  _streamedKey?: string;
  _streamedTitle?: string;
  _streamedNative?: StreamedNativeSource;
}

export interface StreamedServerChoice {
  key: string;
  title: string;
  nativeIndex?: number;
  embedIndex?: number;
}

export interface StreamedNativePlayback {
  url: string;
  referer?: string;
  extension: boolean;
}

export type StreamedHandshake =
  | { embedUrl: string; goat: string; body: string }
  | { url: string; referer: string };
