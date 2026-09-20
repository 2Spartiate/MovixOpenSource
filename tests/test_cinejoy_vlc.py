"""Tests hors ligne du protocole, des interactions et du relais Cinejoy."""

from contextlib import redirect_stdout
import gzip
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import re
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import cinejoy_vlc as cinejoy

cinejoy.load_dependencies()


class ExtractionTests(unittest.TestCase):
    def test_hls_and_file_qualities_are_kept_but_embeds_are_skipped(self):
        streams = cinejoy.parse_streams({"stream": [
            {"type": "application/vnd.apple.mpegurl", "playlist": "https://cdn.example/master.m3u8",
             "qualities": {"720": {"url": "https://cdn.example/variant.m3u8"}}},
            {"type": "file", "qualities": {
                "1080": {"url": "https://cdn.example/movie.mp4"},
                "720": {"url": "https://cdn.example/movie-720.mp4"},
            }},
            {"type": "hls", "playlist": "<iframe>"},
            {"type": "file", "qualities": {"auto": {"url": "file:///etc/passwd"}}},
        ]}, "Lisbon")
        self.assertEqual([s.quality for s in streams], ["auto", "1080", "720"])
        self.assertEqual((streams[0].kind, streams[0].url), ("hls", "https://cdn.example/master.m3u8"))
        self.assertTrue(all(s.headers == cinejoy.PLAYBACK_HEADERS for s in streams))

    def test_direct_mp4_urls_and_mime_types_are_recognized(self):
        captions = [{"url": "https://cdn.example/sub.vtt", "language": "fr"}]
        streams = cinejoy.parse_streams({"stream": [
            {"type": "mp4", "url": "https://cdn.example/movie.mp4", "quality": "1080", "captions": captions},
            {"type": 'video/mp4; codecs="avc1.640028"', "src": "https://cdn.example/opaque?token=fixture"},
            {"type": "file", "file": "https://cdn.example/download"},
            {"playlist": "https://cdn.example/clip.MP4?token=fixture"},
            {"url": "https://cdn.example/video.m4v"},
            {"type": "embed", "url": "https://cdn.example/player.mp4"},
            {"url": "https://cdn.example/player"},
            {"type": "mp4", "url": "file:///tmp/movie.mp4"},
        ]}, "Files")
        self.assertEqual(len(streams), 5)
        self.assertTrue(all(s.kind == "mp4" for s in streams))
        self.assertEqual((streams[0].quality, streams[0].captions), ("1080", captions))
        self.assertTrue(all(s.headers == cinejoy.PLAYBACK_HEADERS for s in streams))

    def test_mp4_qualities_accept_urls_and_keep_the_same_group(self):
        streams = cinejoy.parse_streams({"stream": [{
            "type": "video/mp4", "qualities": {
                "1080": "https://cdn.example/high?token=fixture",
                "720": {"url": "https://cdn.example/low?token=fixture"},
                "broken": None,
            },
        }]}, "Files")
        self.assertEqual([(s.kind, s.quality) for s in streams], [("mp4", "1080"), ("mp4", "720")])
        self.assertEqual(streams[0].group, streams[1].group)

    def test_response_authentication_and_envelope_status(self):
        sealed = bytes(range(32)) + b"\x07" + bytes(range(65)) + b"request"
        nonce = bytes(range(12))
        aad = b"lumen-gate-v2\x00\x02\x07" + bytes(range(65))

        def encrypt(envelope):
            return nonce + cinejoy.AESGCM(sealed[:32]).encrypt(nonce, json.dumps(envelope).encode(), aad)

        packet = encrypt({"status": 200, "data": {"stream": []}})
        self.assertEqual(cinejoy.Gate.decrypt(packet, sealed), {"stream": []})
        with self.assertRaisesRegex(cinejoy.CinejoyError, "illisible"):
            cinejoy.Gate.decrypt(packet[:-1] + bytes([packet[-1] ^ 1]), sealed)
        with self.assertRaisesRegex(cinejoy.CinejoyError, "404"):
            cinejoy.Gate.decrypt(encrypt({"status": 404, "data": {}}), sealed)
        with self.assertRaisesRegex(cinejoy.CinejoyError, "incomplète"):
            cinejoy.Gate.decrypt(b"short", sealed)

    def test_non_http_and_private_literal_urls_are_rejected(self):
        for url in ("file:///tmp/a", "--option", "https://a\n#EXTVLCOPT:x", "http://127.0.0.1/a",
                    "http://localhost/a", "http://[::1]/a", "http://10.0.0.1/a", "https://x:99999/a"):
            with self.subTest(url=url), self.assertRaises(cinejoy.CinejoyError):
                cinejoy.http_url(url)

    def test_refusing_vlc_never_starts_a_relay_or_player(self):
        stream = cinejoy.Stream("Lisbon", "https://cdn.example/a.m3u8", "hls")
        with patch.object(cinejoy, "extract", return_value=[stream]), \
             patch.object(cinejoy, "play") as play, patch("builtins.input", return_value="non"), \
             redirect_stdout(io.StringIO()):
            self.assertEqual(cinejoy.main(["550"]), 0)
            play.assert_not_called()

    def test_series_specials_and_non_flag_require_no_prompt(self):
        stream = cinejoy.Stream("Lisbon", "https://cdn.example/a.m3u8", "hls")
        with patch.object(cinejoy, "extract", return_value=[stream]) as extract, \
             patch.object(cinejoy, "play") as play, \
             patch("builtins.input", side_effect=AssertionError("Unexpected prompt")), \
             redirect_stdout(io.StringIO()):
            self.assertEqual(cinejoy.main(["125988", "--saison", "0", "--episode", "2", "--non"]), 0)
            args = extract.call_args.args[0]
            self.assertEqual((args.type, args.season, args.episode), ("tv", 0, 2))
            play.assert_not_called()

    def test_yes_launches_only_the_selected_stream(self):
        streams = [cinejoy.Stream("A", "https://cdn.example/1.m3u8", "hls"),
                   cinejoy.Stream("B", "https://cdn.example/2.mp4", "mp4")]
        with patch.object(cinejoy, "extract", return_value=streams), \
             patch.object(cinejoy, "find_vlc", return_value="vlc"), \
             patch.object(cinejoy, "play") as play, redirect_stdout(io.StringIO()):
            self.assertEqual(cinejoy.main(["550", "--flux", "2", "--oui"]), 0)
            play.assert_called_once_with(streams[1], "vlc", 20)

    def test_invalid_yes_no_answer_is_not_treated_as_yes(self):
        with patch("builtins.input", side_effect=["peut-être", "non"]), redirect_stdout(io.StringIO()):
            self.assertEqual(cinejoy.ask_open(), "none")

    def test_browser_choice_and_flag_do_not_launch_vlc_or_prompt_for_source(self):
        streams = [cinejoy.Stream("A", "https://cdn.example/1.m3u8", "hls"),
                   cinejoy.Stream("B", "https://cdn.example/2.m3u8", "hls")]
        with patch.object(cinejoy, "extract", return_value=streams), \
             patch.object(cinejoy, "play_browser") as browser, patch.object(cinejoy, "play") as vlc, \
             patch("builtins.input", side_effect=AssertionError("Unexpected prompt")), \
             patch.object(sys.stdin, "isatty", return_value=True), redirect_stdout(io.StringIO()):
            self.assertEqual(cinejoy.main(["550", "--navigateur"]), 0)
            browser.assert_called_once_with(streams, 0, "Film · TMDB 550", 20)
            vlc.assert_not_called()
        with patch("builtins.input", return_value="navigateur"):
            self.assertEqual(cinejoy.ask_open(), "browser")

    def test_browser_flag_lists_and_selects_only_hls_sources(self):
        streams = [cinejoy.Stream("Files", "https://cdn.example/movie.mp4", "mp4"),
                   cinejoy.Stream("A", "https://cdn.example/a.m3u8", "hls"),
                   cinejoy.Stream("B", "https://cdn.example/opaque", "application/vnd.apple.mpegurl")]
        output = io.StringIO()
        with patch.object(cinejoy, "extract", return_value=streams), \
             patch.object(cinejoy, "play_browser") as browser, redirect_stdout(output):
            self.assertEqual(cinejoy.main(["550", "--navigateur", "--flux", "2"]), 0)
            browser.assert_called_once_with(streams[1:], 1, "Film · TMDB 550", 20)
        self.assertNotIn("Files", output.getvalue())
        self.assertEqual(cinejoy.browser_streams(streams, 0), (streams[1:], 0))
        self.assertEqual(cinejoy.browser_streams(streams, 2), (streams[1:], 1))

    def test_file_only_result_does_not_start_a_browser_relay(self):
        streams = [cinejoy.Stream("Files", "https://cdn.example/opaque", "fichier")]
        with patch.object(cinejoy, "PlaybackRelay") as relay, \
             patch.object(cinejoy.webbrowser, "open") as browser, \
             self.assertRaisesRegex(cinejoy.CinejoyError, "Aucun flux HLS"):
            cinejoy.play_browser(streams, 0, "Film", 20)
        relay.assert_not_called()
        browser.assert_not_called()


class RelayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.received = []

        class Upstream(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                cls.received.append((self.path, dict(self.headers)))
                if self.path == "/split":
                    self.send_response(200)
                    self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()
                    for chunk in (b"#EX", b"TM3U\n", b"hls/segment.m4s\n"):
                        self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
                    self.wfile.write(b"0\r\n\r\n")
                    return
                if self.path == "/entry.m3u8":
                    self.send_response(302)
                    self.send_header("Location", "/hls/master.m3u8")
                    self.send_header("Set-Cookie", "media=fixture; Path=/")
                    self.end_headers()
                    return
                if self.path == "/download":
                    self.send_response(302)
                    self.send_header("Location", "/file.mp4")
                    self.end_headers()
                    return
                content_type = "application/octet-stream"
                status = 200
                extra_headers = {}
                if self.path == "/hls/master.m3u8":
                    body = (b'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n'
                            b'#EXT-X-STREAM-INF:BANDWIDTH=800000\nvideo.m3u8\n')
                elif self.path in ("/hls/video.m3u8", "/hls/audio.m3u8"):
                    body = (b'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key"\n'
                            b'#EXT-X-MAP:URI="init.mp4"\n#EXTINF:10,\nsegment.m4s\n#EXT-X-ENDLIST\n')
                elif self.path == "/key":
                    body = b"0123456789abcdef"
                elif self.path in ("/hls/init.mp4", "/hls/segment.m4s"):
                    content_type = "text/html; charset=utf-8"  # Mauvaise annonce vue sur le CDN réel.
                    body = b"\x00\x00\x00\x18moof" + b"video" * 10
                elif self.path in ("/file.mp4", "/opaque"):
                    body = b"0123456789"
                    if self.headers.get("Range") == "bytes=2-5":
                        status, body = 206, body[2:6]
                        extra_headers["Content-Range"] = "bytes 2-5/10"
                    extra_headers["Accept-Ranges"] = "bytes"
                elif self.path == "/compressed.mp4":
                    body = gzip.compress(b"media-content")
                    extra_headers["Content-Encoding"] = "gzip"
                else:
                    self.send_error(404)
                    return
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                for name, value in extra_headers.items():
                    self.send_header(name, value)
                self.end_headers()
                self.wfile.write(body)

        cls.upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        cls.base = f"http://127.0.0.1:{cls.upstream.server_port}"
        cls.upstream_thread = threading.Thread(target=cls.upstream.serve_forever, daemon=True)
        cls.upstream_thread.start()
        real_validator = cinejoy.http_url

        def fixture_url(url):
            return url if url.startswith(cls.base + "/") else real_validator(url)

        cls.validation_patch = patch.object(cinejoy, "http_url", side_effect=fixture_url)
        cls.validation_patch.start()
        cls.relay = cinejoy.PlaybackRelay(cinejoy.Stream("fixture", cls.base + "/entry.m3u8", "hls"), 5)
        cls.relay_thread = threading.Thread(target=cls.relay.serve_forever, daemon=True)
        cls.relay_thread.start()

    @classmethod
    def tearDownClass(cls):
        for server, thread in ((cls.relay, cls.relay_thread), (cls.upstream, cls.upstream_thread)):
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
        cls.validation_patch.stop()

    def get(self, url, **kwargs):
        return cinejoy.requests.get(url, timeout=5, **kwargs)

    def test_nested_hls_keys_audio_init_and_segments_keep_headers(self):
        first_request = len(self.received)
        response = self.get(self.relay.play_url)
        self.assertEqual(response.status_code, 200)
        self.assertIn("mpegurl", response.headers["Content-Type"])
        self.assertNotIn(self.base, response.text)
        master_links = re.findall(r'http://[^"\s]+', response.text)
        self.assertEqual(len(master_links), 2)
        for link in master_links:
            playlist = self.get(link)
            children = re.findall(r'http://[^"\s]+', playlist.text)
            self.assertEqual(len(children), 3)
            for child in children:
                resource = self.get(child)
                self.assertEqual(resource.status_code, 200)
                self.assertNotIn("text/html", resource.headers["Content-Type"])
        received = [(path, headers) for path, headers in self.received[first_request:] if path.startswith("/hls/") or path == "/key"]
        self.assertTrue(received)
        for path, headers in received:
            for name, expected in cinejoy.PLAYBACK_HEADERS.items():
                self.assertEqual(headers.get(name), expected, (path, name))
            self.assertIn("media=fixture", headers.get("Cookie", ""))

    def test_range_and_head_preserve_seeking_metadata(self):
        url = self.relay.register(self.base + "/file.mp4")
        response = self.get(url, headers={"Range": "bytes=2-5"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers["Content-Type"], "video/mp4")
        self.assertEqual(response.headers["Content-Range"], "bytes 2-5/10")
        self.assertEqual(response.content, b"2345")
        response = cinejoy.requests.head(url, timeout=5)
        self.assertEqual(response.headers["Content-Type"], "video/mp4")
        self.assertEqual(response.headers["Content-Length"], "10")
        self.assertEqual(response.content, b"")

    def test_extensionless_mp4_keeps_its_type_and_headers_when_seeking(self):
        stream = cinejoy.Stream("Files", self.base + "/opaque", "video/mp4")
        stream.headers["Referer"] = "https://files.example/"
        url = self.relay.register(stream.url, stream.headers, "video/mp4")
        response = self.get(url, headers={"Range": "bytes=2-5", "If-Range": '"fixture"'})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers["Content-Type"], "video/mp4")
        self.assertEqual(response.headers["Content-Range"], "bytes 2-5/10")
        self.assertEqual(response.headers["Accept-Ranges"], "bytes")
        self.assertEqual(response.content, b"2345")
        headers = self.received[-1][1]
        self.assertEqual(headers["Referer"], stream.headers["Referer"])
        self.assertEqual(headers["If-Range"], '"fixture"')

    def test_mp4_redirect_uses_the_final_url_format_and_preserves_ranges(self):
        response = self.get(self.relay.register(self.base + "/download"), headers={"Range": "bytes=2-5"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers["Content-Type"], "video/mp4")
        self.assertEqual(response.headers["Content-Range"], "bytes 2-5/10")
        self.assertEqual(response.content, b"2345")

    def test_hls_signature_split_across_http_chunks_is_rewritten(self):
        response = self.get(self.relay.register(self.base + "/split"))
        self.assertIn("mpegurl", response.headers["Content-Type"])
        self.assertIn(f"http://127.0.0.1:{self.relay.server_port}/", response.text)
        self.assertNotIn("hls/segment.m4s", response.text)

    def test_compressed_file_does_not_keep_encoded_content_length(self):
        response = self.get(self.relay.register(self.base + "/compressed.mp4"))
        self.assertEqual(response.content, b"media-content")
        self.assertNotIn("Content-Length", response.headers)
        self.assertNotIn("Content-Encoding", response.headers)

    def test_only_registered_paths_are_served(self):
        response = self.get(f"http://127.0.0.1:{self.relay.server_port}/?url=https://example.com")
        self.assertEqual(response.status_code, 404)

    def test_browser_page_excludes_files_and_escapes_remote_metadata(self):
        streams = cinejoy.parse_streams({"stream": [{
            "type": "file", "qualities": {
                "1080": {"url": self.base + "/file.mp4"},
                "720": {"url": self.base + "/compressed.mp4"},
            },
        }, {
            "type": "hls", "playlist": self.base + "/hls/master.m3u8",
            "captions": [{"url": self.base + "/sub.srt", "type": "srt", "language": "fr"}],
        }]}, '</script><script>alert("x")</script>')
        page = self.relay.configure_browser(streams, 1, "Film de test")
        response = self.get(page)
        self.assertEqual(response.status_code, 200)
        self.assertIn("nonce-", response.headers["Content-Security-Policy"])
        self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
        self.assertNotIn('<script>alert("x")</script>', response.text)
        encoded = re.search(r'<script id="cinejoy-config" type="application/json">(.*?)</script>', response.text).group(1)
        config = json.loads(encoded)
        self.assertEqual(config["selectedStream"], 0)
        self.assertEqual(config["selectedSource"], 0)
        self.assertEqual(len(config["sources"]), 1)
        variants = config["sources"][0]["variants"]
        self.assertEqual(len(variants), 1)
        self.assertEqual((variants[0]["type"], variants[0]["format"]), ("application/x-mpegurl", "HLS"))
        self.assertNotIn("video/mp4", encoded)
        caption = config["sources"][0]["captions"][0]
        self.assertEqual(caption["type"], "srt")
        self.assertNotIn(self.base, encoded)
        self.assertEqual(cinejoy.requests.head(page, timeout=5).content, b"")
        self.assertEqual(self.get(page.replace(self.relay.token, "invalid")).status_code, 404)

    def test_each_source_keeps_its_headers_on_nested_resources(self):
        custom = {**cinejoy.PLAYBACK_HEADERS, "Referer": "https://second.example/"}
        primary = self.relay.register(self.base + "/hls/master.m3u8")
        other = self.relay.register(self.base + "/hls/master.m3u8", custom)
        self.assertNotEqual(primary, other)
        playlist = self.get(other)
        video = re.findall(r'http://[^"\s]+', playlist.text)[-1]
        nested = self.get(video)
        segment = re.findall(r'http://[^"\s]+', nested.text)[-1]
        self.assertEqual(self.get(segment).status_code, 200)
        self.assertEqual(self.received[-1][1]["Referer"], custom["Referer"])


if __name__ == "__main__":
    unittest.main()
