import React, { useEffect } from 'react';
import { getFrembedBase } from '../utils/frembedConfig';
import { isMovixTvRuntime } from '../utils/tvRuntime';

interface VideoPlayerProps {
  movieId: string;
  nextMovie?: any;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ movieId, nextMovie }) => {
  useEffect(() => {
    // TV must never try to inspect/manipulate a cross-origin embedded player.
    // The iframe itself is focusable below; its internal keyboard behavior is
    // owned by the third-party document.
    if (isMovixTvRuntime()) return;

    const iframe = document.querySelector('iframe');
    if (iframe) {
      const iframeWindow = iframe.contentWindow;
      if (iframeWindow) {
        iframeWindow.document.head.innerHTML += `
          <script src="https://cdn.jsdelivr.net/npm/disable-devtool"></script>
          <script>
            DisableDevtool({
              ondevtoolopen: function() {
                window.location.reload();
              }
            });
          </script>
        `;
      }
    }
  }, []);

  return (
    <iframe
      src={`${getFrembedBase()}/api/film.php?id=${movieId}`}
      width="100%"
      height="500px"
      frameBorder="0"
      allowFullScreen
      scrolling="no"
      style={{ overflow: 'hidden' }}
      sandbox="allow-scripts allow-same-origin"
      tabIndex={isMovixTvRuntime() ? 0 : undefined}
      data-tv-focus={isMovixTvRuntime() ? '' : undefined}
      aria-label={isMovixTvRuntime() ? 'Lecteur vidéo externe' : undefined}
    />
  );
};

export default VideoPlayer; 