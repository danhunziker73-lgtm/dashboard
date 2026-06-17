#!/usr/bin/env python3
"""
SmartHome Dashboard - Local Sonos API Server
Serves dashboard static files + Sonos/SoCo API endpoints.
"""
import sys
import os
import json
import socket
import threading
import time
import urllib.parse
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

# Force UTF-8 output and line buffering on Windows
try:
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
except Exception:
    pass

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_lan_ip():
    """Get the LAN IP of this machine (reachable from Sonos)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

LAN_IP = get_lan_ip()


# ─── SoCo Import ──────────────────────────────────────────────────────────────
try:
    import soco
    SOCO_AVAILABLE = True
except ImportError:
    SOCO_AVAILABLE = False
    print("WARNING: SoCo not installed.")

# ─── Sonos Device Cache ────────────────────────────────────────────────────────
SONOS_DEVICES = {}   # ip -> {"name", "ip", "uid", "device"}
SONOS_LOCK = threading.Lock()

def _cache_loop():
    while True:
        try:
            speakers = list(soco.discover(timeout=3))
            new = {}
            for sp in speakers:
                try:
                    new[sp.ip_address] = {
                        "name": sp.player_name,
                        "ip":   sp.ip_address,
                        "uid":  sp.uid,
                        "device": sp,
                    }
                except Exception as ex:
                    print(f"[Cache] skip {sp.ip_address}: {ex}")
            with SONOS_LOCK:
                SONOS_DEVICES.clear()
                SONOS_DEVICES.update(new)
            print(f"[Cache] {len(new)} speaker(s): {[v['name'] for v in new.values()]}")
        except Exception as e:
            print(f"[Cache] discovery error: {e}")
        time.sleep(60)

if SOCO_AVAILABLE:
    t = threading.Thread(target=_cache_loop, daemon=True)
    t.start()

def speakers_list():
    with SONOS_LOCK:
        return [v["device"] for v in SONOS_DEVICES.values()]

def speaker_by_ip(ip):
    if not ip or not SOCO_AVAILABLE:
        return None
    with SONOS_LOCK:
        if ip in SONOS_DEVICES:
            return SONOS_DEVICES[ip]["device"]
    # Direct init fallback
    try:
        dev = soco.SoCo(ip)
        with SONOS_LOCK:
            SONOS_DEVICES[ip] = {"name": dev.player_name, "ip": ip,
                                  "uid": dev.uid, "device": dev}
        return dev
    except Exception:
        return None

def _resolve_url_for_sonos(url):
    if not url:
        return url
    # If it is a relative path, prepend http://<LAN_IP>:<PORT>
    if url.startswith("/"):
        return f"http://{LAN_IP}:{PORT}{url}"
    
    # Check if the URL contains localhost or 127.0.0.1
    try:
        parsed = urllib.parse.urlparse(url)
        netloc = parsed.netloc
        if ":" in netloc:
            host, port_str = netloc.split(":", 1)
        else:
            host, port_str = netloc, ""
        
        if host in ("localhost", "127.0.0.1"):
            new_netloc = f"{LAN_IP}:{port_str}" if port_str else LAN_IP
            parsed = parsed._replace(netloc=new_netloc)
            return urllib.parse.urlunparse(parsed)
    except Exception as e:
        print(f"[Resolver] Error parsing URL {url}: {e}")
    
    return url

# ─── HTTP Handler ──────────────────────────────────────────────────────────────
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Set directory before super().__init__ calls do_*
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    # ── Logging ──
    def log_message(self, fmt, *args):
        print(f"[HTTP] {self.address_string()} {fmt % args}", flush=True)

    # ── CORS helper ──
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def json_ok(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    # ── OPTIONS (preflight) ──
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ── GET ──
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path
        query  = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/api/sonos/state_all":
                self._state_all()
            elif path == "/api/sonos/server_ip":
                self.json_ok({"server_ip": LAN_IP})
            elif path == "/api/sonos/browse":
                self._browse(query)
            elif path.startswith("/api/audio/stream"):
                self._proxy_audio(query)
            else:
                super().do_GET()
        except Exception as e:
            import traceback
            traceback.print_exc()
            try:
                self.json_ok({"error": str(e)}, 500)
            except Exception:
                pass

    # ── POST ──
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path

        try:
            if path == "/api/sonos/control":
                length = int(self.headers.get("Content-Length", 0))
                raw    = self.rfile.read(length)
                body   = json.loads(raw.decode("utf-8"))
                self._control(body)
            else:
                self.json_ok({"error": "Not Found"}, 404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            try:
                self.json_ok({"error": str(e)}, 500)
            except Exception:
                pass

    # ─────────────────────── API Handlers ────────────────────────────────────

    def _state_all(self):
        if not SOCO_AVAILABLE:
            return self.json_ok({"error": "SoCo not available"}, 500)
        result = []
        for sp in speakers_list():
            try:
                ti = sp.get_current_transport_info()
                tk = sp.get_current_track_info()
                art = tk.get("album_art", "")
                if art and art.startswith("/"):
                    art = f"http://{sp.ip_address}:1400{art}"
                result.append({
                    "name":   sp.player_name,
                    "ip":     sp.ip_address,
                    "uid":    sp.uid,
                    "state":  ti.get("current_transport_state", "UNKNOWN").lower(),
                    "volume": sp.volume,
                    "mute":   sp.mute,
                    "track": {
                        "title":     tk.get("title", ""),
                        "artist":    tk.get("artist", ""),
                        "album":     tk.get("album", ""),
                        "album_art": art,
                        "position":  tk.get("position", ""),
                        "duration":  tk.get("duration", ""),
                        "uri":       tk.get("uri", ""),
                    }
                })
            except Exception as e:
                result.append({
                    "name": sp.player_name, "ip": sp.ip_address,
                    "uid": sp.uid, "state": "offline",
                    "volume": 0, "mute": False,
                    "track": {"title": "Offline", "artist": str(e),
                              "album": "", "album_art": "",
                              "position": "", "duration": "", "uri": ""}
                })
        self.json_ok(result)

    def _control(self, body):
        ip     = body.get("ip")
        action = body.get("action")
        value  = body.get("value")
        sp = speaker_by_ip(ip)
        if not sp:
            return self.json_ok({"error": "Device not found"}, 404)
        try:
            if   action == "play":      sp.play()
            elif action == "pause":     sp.pause()
            elif action == "next":      sp.next()
            elif action == "previous":  sp.previous()
            elif action == "volume":    sp.volume = int(value)
            elif action == "mute":      sp.mute = bool(value)
            elif action == "play_uri":
                resolved_url = _resolve_url_for_sonos(value)
                print(f"[Sonos] play_uri: {resolved_url}")
                sp.play_uri(resolved_url)
            elif action == "play_queue":
                urls = body.get("urls", [])
                if urls:
                    resolved_urls = [_resolve_url_for_sonos(u) for u in urls]
                    print(f"[Sonos] play_queue with {len(resolved_urls)} tracks")
                    sp.stop(); sp.clear_queue()
                    for u in resolved_urls: sp.add_uri_to_queue(u)
                    sp.play_from_queue(0)
            else:
                return self.json_ok({"error": f"Unknown action: {action}"}, 400)
            self.json_ok({"success": True})
        except Exception as e:
            self.json_ok({"error": str(e)}, 500)

    def _browse(self, query):
        ip      = query.get("ip", [None])[0]
        item_id = query.get("item_id", [None])[0]
        sp = speaker_by_ip(ip)
        if not sp:
            return self.json_ok({"error": "Device not found"}, 404)
        try:
            ml = sp.music_library
            data = []
            if not item_id:
                data = [
                    {"title": "Sonos-Favoriten",    "media_content_id": "root:favorites",
                     "media_content_type": "favorites", "can_expand": True, "can_play": False},
                    {"title": "Musikbibliothek (NAS)", "media_content_id": "root:library",
                     "media_content_type": "library",   "can_expand": True, "can_play": False},
                ]
            elif item_id == "root:favorites":
                for f in ml.get_sonos_favorites():
                    uri = f.resources[0].uri if f.resources else ""
                    data.append({"title": f.title, "media_content_id": f.item_id,
                                  "media_content_type": f.item_class,
                                  "can_expand": False, "can_play": True, "uri": uri})
            elif item_id == "root:library":
                for item in ml.browse(None):
                    data.append({"title": item.title, "media_content_id": item.item_id,
                                  "media_content_type": item.item_class,
                                  "can_expand": True, "can_play": False})
            else:
                class _Item:
                    def __init__(self, iid): self.item_id = iid
                for item in ml.browse(_Item(item_id)):
                    is_c = isinstance(item, soco.data_structures.DidlContainer)
                    uri  = item.resources[0].uri if item.resources else ""
                    data.append({"title": item.title, "media_content_id": item.item_id,
                                  "media_content_type": item.item_class,
                                  "can_expand": is_c,
                                  "can_play": not is_c or item.item_class.startswith("object.container.album"),
                                  "uri": uri})
            self.json_ok({"children": data})
        except Exception as e:
            self.json_ok({"error": str(e)}, 500)

    def _proxy_audio(self, query):
        """
        Audio proxy: fetches a Navidrome stream and re-serves it with a
        guaranteed audio Content-Type so Sonos accepts it without UPnP 714.
        Sonos calls: GET http://127.0.0.1:8000/api/audio/stream?url=<encoded>
        """
        url = query.get("url", [None])[0]
        if not url:
            return self.json_ok({"error": "Missing url parameter"}, 400)

        # Forward the Range header from Sonos to Navidrome if present
        headers = {"User-Agent": "SoCo/1.0"}
        range_header = self.headers.get("Range")
        if range_header:
            headers["Range"] = range_header
            print(f"[Proxy] Range requested: {range_header}")

        print(f"[Proxy] Streaming: {url[:100]}")
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as upstream:
                status = upstream.status if hasattr(upstream, "status") else 200
                
                ct = upstream.headers.get("Content-Type", "audio/mpeg")
                # Guarantee a proper audio MIME type
                if not ct.startswith("audio/") and not ct.startswith("video/"):
                    ct = "audio/mpeg"
                
                cl = upstream.headers.get("Content-Length", None)
                cr = upstream.headers.get("Content-Range", None)

                self.send_response(status)
                self.send_header("Content-Type", ct)
                self.send_header("Accept-Ranges", "bytes")
                self._cors()
                if cl:
                    self.send_header("Content-Length", cl)
                if cr:
                    self.send_header("Content-Range", cr)
                self.end_headers()

                # Stream in 64 KB chunks
                while True:
                    chunk = upstream.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            print(f"[Proxy] Stream complete.")
        except Exception as e:
            print(f"[Proxy] Error: {e}")
            try:
                status_code = getattr(e, "code", 502)
                self.json_ok({"error": str(e)}, status_code)
            except Exception:
                pass

# ─── MIME types ───────────────────────────────────────────────────────────────

Handler.extensions_map.update({
    ".js":   "application/javascript",
    ".css":  "text/css",
    ".html": "text/html",
    ".json": "application/json",
})

# ─── Server ───────────────────────────────────────────────────────────────────
class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """Threaded server so audio proxy and API calls run concurrently."""
    daemon_threads = True

if __name__ == "__main__":
    os.chdir(DIRECTORY)

    server = ThreadingHTTPServer(("", PORT), Handler)
    server.allow_reuse_address = True

    print(f"Serving {DIRECTORY}")
    print(f"Listening on http://127.0.0.1:{PORT}")
    print("Press Ctrl+C to stop.")
    sys.stdout.flush()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down.")
        server.server_close()


