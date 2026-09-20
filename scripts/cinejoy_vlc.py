#!/usr/bin/env python3
"""ID TMDB -> Cinejoy -> VLC ou Vidstack, avec les en-têtes nécessaires.

Installation : python -m pip install -r scripts/requirements-cinejoy.txt
Utilisation  : python scripts/cinejoy_vlc.py

Inspiré de Zenda-Cross/vega-providers, extractors/cinejoy.ts, commit
06d95c4d38fd534e2c31b416b6ad9614579e3c03. Adaptation au protocole public
lumen-gate-v2 de Cinejoy observé le 12 septembre 2026 (ancien chunk supprimé).
Le WASM distant s'exécute sans imports ni accès système, avec des limites.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import threading
from urllib.parse import urljoin, urlsplit
import webbrowser


SITE = "https://cinejoy.to"
API = "https://api.shegu.st"
DOWNLOADS = "https://downloads.shegu.st"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
PLAYBACK_HEADERS = {"User-Agent": USER_AGENT, "Referer": SITE + "/", "Origin": SITE}
FALLBACK_SERVERS = ["Lisbon", "Nebula", "Solara", "Athens", "Joy", "Castle", "Canaias"]
MAX_MANIFEST = 4 * 1024 * 1024
MAX_API_BODY = 8 * 1024 * 1024


class CinejoyError(Exception):
    """Erreur à afficher sans traceback dans le terminal."""


def load_dependencies():
    global requests, wasmtime, AESGCM, InvalidTag
    try:
        import requests
        import wasmtime
        from cryptography.exceptions import InvalidTag
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:
        raise CinejoyError(
            "Dépendances manquantes. Lance : "
            "python -m pip install -r scripts/requirements-cinejoy.txt"
        ) from exc


def http_url(value: str) -> str:
    if not isinstance(value, str) or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise CinejoyError("URL de flux invalide.")
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
            raise ValueError
        if parsed.port == 0:
            raise ValueError
    except ValueError as exc:
        raise CinejoyError("Une URL HTTP(S) valide est nécessaire.") from exc
    if host.lower() == "localhost" or host.lower().endswith((".localhost", ".local")):
        raise CinejoyError("Une source distante ne peut pas viser la machine locale.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if not address.is_global:
            raise CinejoyError("Une source distante ne peut pas viser une IP privée.")
    return value


def read_bounded(response, maximum: int) -> bytes:
    data = bytearray()
    for chunk in response.iter_content(64 * 1024):
        data.extend(chunk)
        if len(data) > maximum:
            raise CinejoyError("Réponse distante trop volumineuse.")
    return bytes(data)


def get_bytes(url: str, headers: dict, timeout: int, maximum=MAX_API_BODY) -> bytes:
    with requests.get(url, headers=headers, timeout=timeout, stream=True) as response:
        response.raise_for_status()
        return read_bounded(response, maximum)


class Gate:
    """Le même échange WASM + AES-GCM que le lecteur Cinejoy actuel."""

    def __init__(self, headers: dict, timeout: int):
        self.headers, self.timeout = headers, timeout
        config = wasmtime.Config()
        config.consume_fuel = True
        self.engine = wasmtime.Engine(config)
        wasm = get_bytes(API + "/crush.wasm", headers, timeout, 2 * 1024 * 1024)
        self.module = wasmtime.Module(self.engine, wasm)
        if self.module.imports:
            raise CinejoyError("Le WASM Cinejoy demande des imports non pris en charge.")

    def seal(self, path: str, payload: dict) -> bytes:
        message = json.dumps(
            {"path": path, "payload": payload}, separators=(",", ":")
        ).encode("utf-8")
        random_bytes = secrets.token_bytes(44)
        capacity = len(message) + 512
        with wasmtime.Store(self.engine) as store:
            store.set_limits(memory_size=64 * 1024 * 1024, instances=1, memories=1)
            store.set_fuel(200_000_000)
            exports = wasmtime.Instance(store, self.module, []).exports(store)
            if not all(name in exports for name in ("memory", "alloc", "dealloc", "seal_request")):
                raise CinejoyError("Le protocole WASM Cinejoy a changé.")
            pointers = []
            try:
                for size in (len(message), len(random_bytes), capacity):
                    pointer = exports["alloc"](store, size)
                    if not pointer:
                        raise CinejoyError("Allocation mémoire WASM impossible.")
                    pointers.append((pointer, size))
                source, random_ptr, output = (p for p, _ in pointers)
                memory = exports["memory"]
                memory.write(store, message, source)
                memory.write(store, random_bytes, random_ptr)
                size = exports["seal_request"](
                    store, source, len(message), random_ptr, len(random_bytes), output, capacity
                )
                if not 98 < size <= capacity:
                    raise CinejoyError("Cinejoy n'a pas pu préparer la requête chiffrée.")
                return bytes(memory.read(store, output, output + size))
            finally:
                for pointer, size in pointers:
                    exports["dealloc"](store, pointer, size)

    @staticmethod
    def decrypt(data: bytes, sealed: bytes) -> dict:
        if len(data) < 28:
            raise CinejoyError("Réponse chiffrée Cinejoy incomplète.")
        aad = b"lumen-gate-v2" + bytes((0, 2, sealed[32])) + sealed[33:98]
        try:
            plain = AESGCM(sealed[:32]).decrypt(data[:12], data[12:], aad)
            envelope = json.loads(plain)
        except (InvalidTag, ValueError, UnicodeDecodeError) as exc:
            raise CinejoyError("Réponse Cinejoy illisible : le protocole a peut-être changé.") from exc
        if not isinstance(envelope, dict) or not isinstance(envelope.get("status"), int):
            raise CinejoyError("Réponse Cinejoy inattendue.")
        status = envelope["status"]
        if not 200 <= status < 300:
            raise CinejoyError(f"Le serveur Cinejoy renvoie HTTP {status}.")
        if not isinstance(envelope.get("data"), dict):
            raise CinejoyError("Données Cinejoy absentes.")
        return envelope["data"]

    def query(self, server: str, media: str, payload: dict) -> dict:
        sealed = self.seal(f"/{server}/{'movie' if media == 'movie' else 'series'}", payload)
        headers = {**self.headers, "Content-Type": "text/plain;charset=UTF-8"}
        with requests.post(
            API + "/g", headers=headers, data=sealed[98:], timeout=self.timeout, stream=True
        ) as response:
            response.raise_for_status()
            return self.decrypt(read_bounded(response, MAX_API_BODY), sealed)


@dataclass
class Stream:
    server: str
    url: str
    kind: str
    quality: str = "auto"
    captions: list = field(default_factory=list)
    headers: dict = field(default_factory=lambda: dict(PLAYBACK_HEADERS))
    group: str = ""


STREAM_MIME_TYPES = {
    "hls": "application/x-mpegurl", "mp4": "video/mp4", "webm": "video/webm",
}


def stream_kind(url: str, kind: str | None = None) -> str:
    """Reconnaît le format annoncé par l'API ou l'extension, hors query string."""
    kind = kind.split(";", 1)[0].strip().lower() if isinstance(kind, str) else ""
    aliases = {
        "hls": "hls", "m3u8": "hls", "application/x-mpegurl": "hls",
        "application/vnd.apple.mpegurl": "hls", "mp4": "mp4", "video/mp4": "mp4",
        "m4v": "mp4", "video/x-m4v": "mp4", "webm": "webm", "video/webm": "webm",
    }
    suffix = Path(urlsplit(url).path).suffix.lower()
    return aliases.get(kind) or {
        ".m3u8": "hls", ".mp4": "mp4", ".m4v": "mp4", ".webm": "webm",
    }.get(suffix) or kind or "fichier"


def browser_streams(streams: list[Stream], selected: int = 0) -> tuple[list[Stream], int]:
    """Le navigateur conserve uniquement les sources HLS, sans conversion."""
    chosen = streams[selected] if streams else None
    available = [stream for stream in streams if stream_kind(stream.url, stream.kind) == "hls"]
    if not available:
        raise CinejoyError("Aucun flux HLS disponible pour le navigateur. Utilise VLC pour les sources fichiers.")
    index = next((i for i, stream in enumerate(available) if stream is chosen), 0)
    return available, index


def parse_streams(data: dict, server: str) -> list[Stream]:
    streams = []
    for item_index, item in enumerate(data.get("stream") or []):
        if not isinstance(item, dict):
            continue
        item_kind = stream_kind("", item.get("type"))
        if item_kind in {"embed", "iframe"}:
            continue
        candidates = []
        direct = False
        if item_kind in {"file", "fichier", "mp4", "webm"} and isinstance(item.get("qualities"), dict):
            for quality, source in item["qualities"].items():
                if isinstance(source, str):
                    source = {"url": source}
                if isinstance(source, dict) and source.get("url"):
                    candidates.append((source["url"], source.get("type") or item.get("type"), str(quality)))
        elif item.get("playlist"):
            candidates.append((item["playlist"], item.get("type"), str(item.get("quality") or "auto")))
        else:
            url = item.get("url") or item.get("file") or item.get("src")
            if url:
                direct = True
                candidates.append((url, item.get("type"), str(item.get("quality") or "auto")))
        for url, kind, quality in candidates:
            try:
                http_url(url)
            except CinejoyError:
                continue  # Ignore les embeds non résolus et les schémas non HTTP.
            kind = stream_kind(url, kind)
            if direct and kind not in {"mp4", "webm", "hls", "file"}:
                continue
            if kind in {"file", "fichier"}:
                kind = "hls" if item.get("playlist") and not item.get("type") else "mp4"
            streams.append(Stream(
                server, url, kind, quality, item.get("captions") or [],
                group=f"{server}:{item_index}",
            ))
    return streams


def extract(args) -> list[Stream]:
    media_path = f"{args.type}/{args.tmdb}"
    payload = {"tmdb": str(args.tmdb)}
    if args.type == "tv":
        media_path += f"/{args.season}/{args.episode}"
        payload.update(season=str(args.season), episode=str(args.episode))
    headers = {**PLAYBACK_HEADERS, "Referer": SITE + "/watch/" + media_path}
    try:
        data = json.loads(get_bytes(API + "/servers", headers, args.timeout))
        servers = list(dict.fromkeys(
            s["name"] for s in data["servers"]
            if isinstance(s, dict) and isinstance(s.get("name"), str) and s["name"]
        ))
        if not servers:
            raise CinejoyError("Liste des serveurs vide.")
    except (requests.RequestException, ValueError, KeyError, TypeError, CinejoyError):
        print("Liste des serveurs indisponible ; utilisation de la liste de secours.", file=sys.stderr)
        servers = FALLBACK_SERVERS
    if args.server:
        servers = [s for s in servers if s.casefold() == args.server.casefold()]
        if not servers:
            raise CinejoyError("Serveur inconnu. Retire --serveur pour consulter les flux disponibles.")
    streams = []
    try:
        gate = Gate(headers, args.timeout)

        def query(server):
            try:
                found = parse_streams(gate.query(server, args.type, payload), server)
                return found, None if found else "aucun flux direct"
            except (requests.RequestException, CinejoyError, wasmtime.WasmtimeError, wasmtime.Trap) as exc:
                return [], str(exc)

        with ThreadPoolExecutor(max_workers=4) as pool:
            for server, (found, error) in zip(servers, pool.map(query, servers)):
                streams.extend(found)
                print(f"  {server} : {len(found)} flux" + (f" ({error})" if error else ""), file=sys.stderr)
    except (requests.RequestException, CinejoyError, wasmtime.WasmtimeError, wasmtime.Trap) as exc:
        print(f"Extraction API indisponible : {exc}", file=sys.stderr)
    if not args.server:
        try:
            data = json.loads(get_bytes(DOWNLOADS + "/" + media_path, headers, args.timeout))
            if not isinstance(data, dict):
                raise CinejoyError("Liste des liens complémentaires invalide.")
            for item in data.get("links") or []:
                if not isinstance(item, dict) or not item.get("url"):
                    continue
                try:
                    url = http_url(item["url"])
                except CinejoyError:
                    continue
                streams.append(Stream(
                    item.get("source") or "Download", url,
                    stream_kind(url, item.get("type")),
                    str(item.get("quality") or "auto"),
                ))
        except (requests.RequestException, ValueError, TypeError, CinejoyError) as exc:
            print(f"Liens complémentaires indisponibles : {exc}", file=sys.stderr)
    unique = {}
    for stream in streams:
        unique.setdefault(stream.url, stream)
    if not unique:
        raise CinejoyError("Aucun flux trouvé. Vérifie l'ID TMDB, le type et l'épisode, ou réessaie plus tard.")
    return list(unique.values())


def rewrite_manifest(text: str, base_url: str, register) -> str:
    """Réécrit variantes, audio, sous-titres, clés AES et segments HLS."""
    def uri(value):
        return value if value.startswith("data:") else register(urljoin(base_url, value))

    lines = []
    for line in text.splitlines():
        if line.strip() and not line.lstrip().startswith("#"):
            line = uri(line.strip())
        else:
            line = re.sub(r'\bURI="([^"\r\n]+)"', lambda match: f'URI="{uri(match[1])}"', line)
        lines.append(line)
    return "\n".join(lines) + "\n"


class PlaybackRelay(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, stream: Stream, timeout: int):
        self.stream, self.timeout = stream, timeout
        self.token = secrets.token_urlsafe(24)
        self.urls, self.paths = {}, {}
        self.resource_headers = {}
        self.resource_types = {}
        self.player_page = None
        self.lock = threading.Lock()
        self.cookies = requests.cookies.RequestsCookieJar()
        super().__init__(("127.0.0.1", 0), RelayHandler)
        self.play_url = self.register(
            stream.url, content_type=STREAM_MIME_TYPES.get(stream_kind(stream.url, stream.kind)),
        )

    def register(self, url: str, headers: dict | None = None, content_type: str | None = None) -> str:
        http_url(url)
        headers = dict(headers if headers is not None else self.stream.headers)
        key = (url, tuple(sorted(headers.items())))
        with self.lock:
            if key not in self.paths:
                # Conserve l'extension pour aider VLC à reconnaître HLS et les segments.
                suffix = Path(urlsplit(url).path).suffix
                if not re.fullmatch(r"\.[A-Za-z0-9]{1,8}", suffix):
                    suffix = ""
                path = f"/{self.token}/{len(self.paths)}{suffix}"
                self.paths[key], self.urls[path] = path, url
                self.resource_headers[path] = headers
            if content_type:
                self.resource_types[self.paths[key]] = content_type
            return f"http://127.0.0.1:{self.server_port}{self.paths[key]}"

    def configure_browser(self, streams: list[Stream], selected: int, title: str) -> str:
        streams, selected = browser_streams(streams, selected)
        groups = {}
        selected_group = None
        for index, stream in enumerate(streams):
            kind = stream_kind(stream.url, stream.kind)
            key = stream.group or f"single:{index}"
            # Un manifeste HLS expose déjà ses qualités ; ne pas fusionner ses variantes.
            if kind == "hls":
                key = f"hls:{index}"
            group = groups.setdefault(key, {
                "label": stream.server, "variants": [], "captions": [],
            })
            mime = STREAM_MIME_TYPES.get(kind, "video/mp4")
            group["variants"].append({
                "src": self.register(stream.url, stream.headers, mime), "type": mime,
                "quality": stream.quality, "format": kind.upper(),
                "index": index,
            })
            if index == selected:
                selected_group = key
            known_captions = {c["src"] for c in group["captions"]}
            for caption in stream.captions:
                if not isinstance(caption, dict) or not caption.get("url"):
                    continue
                try:
                    src = self.register(caption["url"], stream.headers)
                except CinejoyError:
                    continue
                if src in known_captions:
                    continue
                fmt = caption.get("type") or Path(urlsplit(caption["url"]).path).suffix.lstrip(".") or "vtt"
                if fmt not in {"vtt", "srt", "ass", "ssa", "json"}:
                    continue
                known_captions.add(src)
                group["captions"].append({
                    "src": src, "kind": "subtitles", "type": fmt,
                    "language": str(caption.get("language") or "und"),
                    "label": str(caption.get("language") or caption.get("id") or "Sous-titres"),
                })
        config = {
            "title": title, "sources": list(groups.values()), "selectedStream": selected,
            "selectedSource": list(groups).index(selected_group),
        }
        # Ne laisse jamais une valeur distante fermer le bloc JSON dans le HTML.
        encoded = json.dumps(config, ensure_ascii=False).replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
        template = Path(__file__).with_name("cinejoy_player.html").read_text(encoding="utf-8")
        self.player_page = template.replace("__CINEJOY_NONCE__", self.token).replace("__CINEJOY_CONFIG__", encoded).encode("utf-8")
        return f"http://127.0.0.1:{self.server_port}/{self.token}/player"


class RelayHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_HEAD(self):
        self.serve(head=True)

    def do_GET(self):
        self.serve(head=False)

    def serve(self, head: bool):
        server = self.server
        if self.path == f"/{server.token}/player" and server.player_page is not None:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(server.player_page)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", (
                f"default-src 'self'; script-src 'nonce-{server.token}' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "connect-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; "
                "media-src 'self' blob:; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
            ))
            self.end_headers()
            if not head:
                self.wfile.write(server.player_page)
            return
        url = server.urls.get(self.path)
        if url is None:
            self.send_error(404)
            return
        resource_headers = server.resource_headers[self.path]
        headers = {**resource_headers, "Accept-Encoding": "identity"}
        for name in ("Range", "If-Range"):
            if self.headers.get(name):
                headers[name] = self.headers[name]
        started = False
        try:
            with requests.Session() as session:
                session.cookies = server.cookies
                response = None
                try:
                    for _ in range(6):
                        http_url(url)
                        response = session.get(
                            url, headers=headers, timeout=server.timeout,
                            stream=True, allow_redirects=False,
                        )
                        if response.status_code not in (301, 302, 303, 307, 308):
                            break
                        location = response.headers.get("Location")
                        if not location:
                            raise CinejoyError("Redirection sans destination.")
                        url = urljoin(response.url, location)
                        response.close()
                    else:
                        raise CinejoyError("Trop de redirections du flux.")
                    if response.status_code not in (200, 206):
                        self.send_error(response.status_code)
                        return
                    chunks = response.iter_content(64 * 1024)
                    first = next(chunks, b"")
                    # Une réponse chunked peut couper jusqu'à la signature #EXTM3U.
                    while len(first) < 16:
                        part = next(chunks, b"")
                        if not part:
                            break
                        first += part
                    content_type = response.headers.get("Content-Type", "application/octet-stream")
                    is_manifest = first.lstrip(b"\xef\xbb\xbf \r\n").startswith(b"#EXTM3U")
                    if is_manifest:
                        body = bytearray(first)
                        for chunk in chunks:
                            body.extend(chunk)
                            if len(body) > MAX_MANIFEST:
                                raise CinejoyError("Playlist HLS trop volumineuse.")
                        rewritten = rewrite_manifest(
                            body.decode("utf-8-sig"), response.url,
                            lambda child: server.register(child, resource_headers),
                        ).encode("utf-8")
                        self.send_response(200)
                        self.send_header("Content-Type", "application/vnd.apple.mpegurl")
                        self.send_header("Content-Length", str(len(rewritten)))
                        self.send_header("Cache-Control", "no-store")
                        self.end_headers()
                        started = True
                        if not head:
                            self.wfile.write(rewritten)
                    else:
                        self.send_response(response.status_code)
                        # Certains CDN servent des MP4 comme téléchargements génériques.
                        # Le format connu reste disponible pour les réponses Range sans signature.
                        generic_type = content_type.split(";", 1)[0].strip().lower()
                        if generic_type in {
                            "", "application/octet-stream", "binary/octet-stream", "application/mp4",
                            "application/x-download", "application/download", "text/plain", "text/html",
                        }:
                            content_type = (
                                STREAM_MIME_TYPES.get(stream_kind(response.url))
                                or server.resource_types.get(self.path)
                                or STREAM_MIME_TYPES.get(stream_kind(server.urls[self.path]))
                                or ("application/octet-stream" if generic_type == "text/html" else content_type)
                            )
                        self.send_header("Content-Type", content_type)
                        names = ("Content-Range", "Accept-Ranges")
                        if not response.headers.get("Content-Encoding"):
                            names += ("Content-Length",)
                        for name in names:
                            if name in response.headers:
                                self.send_header(name, response.headers[name])
                        self.end_headers()
                        started = True
                        if not head:
                            self.wfile.write(first)
                            for chunk in chunks:
                                self.wfile.write(chunk)
                finally:
                    if response is not None:
                        response.close()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # VLC abandonne une requête lors d'un changement de position.
        except (requests.RequestException, CinejoyError, UnicodeError, OSError) as exc:
            print(f"Relais vidéo : {type(exc).__name__} ({urlsplit(url).hostname})", file=sys.stderr)
            if not started:
                self.send_error(502, "Flux distant indisponible")


def find_vlc(explicit: str | None = None) -> str:
    if explicit:
        candidate = shutil.which(explicit) or Path(explicit).expanduser()
        if Path(candidate).is_file():
            return str(candidate)
        raise CinejoyError(f"VLC introuvable : {explicit}")
    candidates = [shutil.which("vlc"), "/Applications/VLC.app/Contents/MacOS/VLC"]
    for variable in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        root = os.environ.get(variable)
        if root:
            candidates.append(str(Path(root) / "VideoLAN" / "VLC" / "vlc.exe"))
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise CinejoyError('VLC introuvable. Utilise --vlc "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe".')


def play(stream: Stream, executable: str, timeout: int):
    with PlaybackRelay(stream, timeout) as relay:
        worker = threading.Thread(target=relay.serve_forever, daemon=True)
        worker.start()
        try:
            command = [
                executable, "--no-one-instance", "--play-and-exit",
                f"--http-user-agent={USER_AGENT}", f"--http-referrer={SITE}/", relay.play_url,
            ]
            process = subprocess.Popen(command)  # Pas de shell : URL et chemin restent des arguments.
            print(f"VLC ouvert. Relais : {relay.play_url}")
            print("Garde ce terminal ouvert pendant la lecture. Ctrl+C arrête le relais.")
            process.wait()
        finally:
            relay.shutdown()
            worker.join(timeout=2)


def play_browser(streams: list[Stream], selected: int, title: str, timeout: int):
    streams, selected = browser_streams(streams, selected)
    with PlaybackRelay(streams[selected], timeout) as relay:
        url = relay.configure_browser(streams, selected, title)
        worker = threading.Thread(target=relay.serve_forever, daemon=True)
        worker.start()
        try:
            print(f"Lecteur Vidstack : {url}", flush=True)
            if not webbrowser.open(url, new=2):
                print("Ouvre ce lien dans ton navigateur.")
            print("Garde le terminal ouvert. Ctrl+C arrête le lecteur et le relais.", flush=True)
            while worker.is_alive():
                worker.join(timeout=0.5)
        finally:
            relay.shutdown()
            worker.join(timeout=2)


def positive(value: str) -> int:
    try:
        number = int(value)
        if number > 0:
            return number
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("Entre un entier supérieur à zéro.")


def season_number(value: str) -> int:
    if value == "0":
        return 0
    return positive(value)


def ask(prompt: str, default: str = "") -> str:
    try:
        return input(prompt).strip() or default
    except EOFError:
        return default


def ask_number(prompt: str, default: int | None = None, allow_zero=False) -> int:
    while True:
        value = ask(prompt, str(default) if default is not None else "")
        try:
            return (season_number if allow_zero else positive)(value)
        except argparse.ArgumentTypeError as exc:
            if not sys.stdin.isatty():
                raise CinejoyError(str(exc)) from exc
            print(exc)


def ask_open() -> str:
    while True:
        answer = ask("Ouvrir avec [vlc/navigateur/non] (non) : ", "non").casefold()
        if answer in {"vlc", "oui", "o", "yes", "y"}:
            return "vlc"
        if answer in {"navigateur", "browser", "web", "b"}:
            return "browser"
        if answer in {"non", "n", "no"}:
            return "none"
        print("Réponds vlc, navigateur ou non.")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Récupère les flux Cinejoy d'un ID TMDB pour VLC ou Vidstack.")
    parser.add_argument("tmdb", nargs="?", type=positive, help="ID numérique TMDB")
    parser.add_argument("--type", choices=("movie", "tv"), help="movie = film, tv = série")
    parser.add_argument("--saison", "--season", dest="season", type=season_number)
    parser.add_argument("--episode", type=positive)
    parser.add_argument("--serveur", "--server", dest="server", help="Limite la recherche à un serveur")
    parser.add_argument("--flux", type=positive, help="Numéro du flux à sélectionner (à partir de 1)")
    parser.add_argument("--vlc", help="Chemin de l'exécutable VLC")
    parser.add_argument("--timeout", type=positive, default=20, help="Délai réseau en secondes (20 par défaut)")
    opening = parser.add_mutually_exclusive_group()
    opening.add_argument("--oui", dest="target", action="store_const", const="vlc", help="Ouvre VLC sans poser la question")
    opening.add_argument("--non", dest="target", action="store_const", const="none", help="Affiche seulement le lien et les headers")
    opening.add_argument("--navigateur", "--browser", dest="target", action="store_const", const="browser", help="Ouvre les sources HLS dans Vidstack")
    args = parser.parse_args(argv)
    interactive = args.tmdb is None
    if args.type == "movie" and (args.season is not None or args.episode is not None):
        parser.error("--saison et --episode nécessitent --type tv.")
    if args.tmdb is None:
        args.tmdb = ask_number("ID TMDB : ")
    if args.type is None:
        if args.season is not None or args.episode is not None:
            args.type = "tv"
        elif interactive:
            while True:
                media = ask("Film ou série ? [film/serie] (film) : ", "film").casefold()
                if media in {"film", "f", "movie", "serie", "série", "s", "tv"}:
                    args.type = "movie" if media in {"film", "f", "movie"} else "tv"
                    break
                print("Entre film ou serie.")
        else:
            args.type = "movie"
    if args.type == "tv":
        if args.season is None:
            args.season = ask_number("Saison (1, 0 pour les spéciaux) : ", 1, allow_zero=True) if interactive else 1
        if args.episode is None:
            args.episode = ask_number("Épisode (1) : ", 1) if interactive else 1
    load_dependencies()
    print(f"Recherche Cinejoy : TMDB {args.tmdb} ({args.type})…", flush=True)
    streams = extract(args)
    if args.target == "browser":
        streams, _ = browser_streams(streams)
    print()
    for number, stream in enumerate(streams, 1):
        print(f"  {number}. {stream.server} | {stream.kind} | qualité {stream.quality}")
    index = args.flux
    if index is None:
        index = ask_number("Numéro du flux (1) : ", 1) if len(streams) > 1 and sys.stdin.isatty() and args.target != "browser" else 1
    if not 1 <= index <= len(streams):
        raise CinejoyError(f"Le numéro de flux doit être entre 1 et {len(streams)}.")
    selected = streams[index - 1]
    print(f"\nFlux sélectionné : {selected.server}\nURL : {selected.url}")
    print("En-têtes :\n" + json.dumps(selected.headers, indent=2, ensure_ascii=False))
    target = args.target if args.target is not None else ask_open()
    if target == "vlc":
        play(selected, find_vlc(args.vlc), args.timeout)
    elif target == "browser":
        if stream_kind(selected.url, selected.kind) != "hls":
            print("Le navigateur utilise uniquement les sources HLS ; ouverture du premier flux HLS disponible.")
        title = f"{'Film' if args.type == 'movie' else 'Série'} · TMDB {args.tmdb}"
        if args.type == "tv":
            title += f" · S{args.season:02d}E{args.episode:02d}"
        play_browser(streams, index - 1, title, args.timeout)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nArrêt demandé.")
        raise SystemExit(130)
    except (CinejoyError, OSError) as error:
        print(f"Erreur : {error}", file=sys.stderr)
        raise SystemExit(1)
