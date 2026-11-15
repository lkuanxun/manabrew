import base64
import hashlib
import hmac
import html
import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

PREFIX = "/api/integrations/v1"
CONTRACT_VERSION = "1.0.0"
SCOPES = {"profile", "collection:read", "decks:read", "events:read"}
CODE_TTL = 60
ACCESS_TTL = int(os.environ.get("MOCK_ACCESS_TTL", "900"))
IDLE_TTL = int(os.environ.get("MOCK_IDLE_TTL", str(30 * 86400)))
ABSOLUTE_TTL = int(os.environ.get("MOCK_ABSOLUTE_TTL", str(180 * 86400)))
ISSUER = os.environ["MOCK_ISSUER"]
CLIENT_ID = os.environ["MOCK_CLIENT_ID"]
CLIENT_SECRET = os.environ["MOCK_CLIENT_SECRET"]
REDIRECT_URIS = set(os.environ["MOCK_REDIRECT_URIS"].split())
USERS = {
    "mock-subject-alice": "Alice (mock)",
    "mock-subject-bob": "Bob (mock)",
}

lock = threading.Lock()
pending = {}
codes = {}
families = {}
access_tokens = {}
refresh_tokens = {}


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def revoke_family(family_id):
    family = families.get(family_id)
    if family:
        family["revoked"] = True
    for table in (access_tokens, refresh_tokens):
        for key in [k for k, v in table.items() if v["family"] == family_id]:
            table[key]["revoked"] = True
    for key in [k for k, v in codes.items() if v.get("family") == family_id]:
        codes.pop(key, None)


def issue(family_id):
    now = time.time()
    access = secrets.token_urlsafe(32)
    refresh = secrets.token_urlsafe(32)
    access_tokens[digest(access)] = {"family": family_id, "expires": now + ACCESS_TTL, "revoked": False}
    refresh_tokens[digest(refresh)] = {"family": family_id, "used": False, "revoked": False}
    families[family_id]["refreshed_at"] = now
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": ACCESS_TTL,
        "refresh_token": refresh,
        "scope": families[family_id]["scope"],
        "contract_version": CONTRACT_VERSION,
    }


def family_alive(family_id):
    family = families.get(family_id)
    now = time.time()
    return (
        family is not None
        and not family["revoked"]
        and now < family["authorized_at"] + ABSOLUTE_TTL
        and now < family["refreshed_at"] + IDLE_TTL
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        path = urlparse(self.path).path
        print(f"{self.command} {path} -> {args[1] if len(args) > 1 else ''}", flush=True)

    def send(self, status, body=b"", content_type="application/json", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload, headers=None):
        self.send(status, json.dumps(payload).encode(), headers=headers)

    def oauth_error(self, status, error):
        self.send_json(status, {"error": error})

    def api_error(self, status, code):
        headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
        self.send_json(status, {"error": {"code": code, "message": code, "request_id": secrets.token_hex(8)}}, headers)

    def form(self):
        length = int(self.headers.get("Content-Length", "0"))
        return {k: v[0] for k, v in parse_qs(self.rfile.read(length).decode()).items()}

    def client_ok(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Basic "):
            return False
        try:
            client_id, _, secret = base64.b64decode(auth[6:]).decode().partition(":")
        except ValueError:
            return False
        return client_id == CLIENT_ID and hmac.compare_digest(secret, CLIENT_SECRET)

    def redirect(self, uri, params):
        self.send(302, headers={"Location": f"{uri}?{urlencode(params)}"})

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == f"{PREFIX}/oauth/authorize":
            return self.authorize_page(parse_qs(url.query))
        if url.path == f"{PREFIX}/me":
            return self.me()
        if url.path == "/health":
            return self.send_json(200, {"ok": True})
        self.api_error(404, "not_found")

    def do_POST(self):
        url = urlparse(self.path)
        if url.path == f"{PREFIX}/oauth/authorize":
            return self.authorize_decision(self.form())
        if url.path == f"{PREFIX}/oauth/token":
            return self.token(self.form())
        if url.path == f"{PREFIX}/oauth/revoke":
            return self.revoke(self.form())
        if url.path == "/mock/revoke-subject":
            return self.revoke_subject(self.form())
        self.api_error(404, "not_found")

    def authorize_page(self, query):
        q = {k: v[0] for k, v in query.items()}
        if q.get("client_id") != CLIENT_ID or q.get("redirect_uri") not in REDIRECT_URIS:
            return self.send(400, b"invalid client or redirect_uri", "text/plain")
        uri, state = q["redirect_uri"], q.get("state", "")
        scope = set(q.get("scope", "").split())
        if q.get("response_type") != "code" or q.get("code_challenge_method") != "S256" or not q.get("code_challenge"):
            return self.redirect(uri, {"error": "invalid_request", "state": state, "iss": ISSUER})
        if not scope or not scope <= SCOPES:
            return self.redirect(uri, {"error": "invalid_scope", "state": state, "iss": ISSUER})
        txn = secrets.token_urlsafe(16)
        with lock:
            pending[txn] = {"redirect_uri": uri, "state": state, "scope": " ".join(sorted(scope)),
                            "challenge": q["code_challenge"], "expires": time.time() + 600}
        options = "".join(
            f'<label><input type="radio" name="subject" value="{html.escape(s)}" required> {html.escape(n)}</label><br>'
            for s, n in USERS.items()
        )
        page = f"""<!doctype html><meta charset="utf-8"><title>Mock Arcana</title>
<body style="font-family:system-ui;max-width:28rem;margin:3rem auto">
<h1>Mock Arcana 授權</h1><p>ManaBrew 要求：{html.escape(" ".join(sorted(scope)))}</p>
<form method="post"><input type="hidden" name="txn" value="{txn}">{options}
<p><button name="decision" value="approve">同意</button> <button name="decision" value="deny" formnovalidate>拒絕</button></p></form>"""
        self.send(200, page.encode(), "text/html; charset=utf-8",
                  {"X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'",
                   "Referrer-Policy": "no-referrer"})

    def authorize_decision(self, form):
        with lock:
            txn = pending.pop(form.get("txn", ""), None)
        if not txn or txn["expires"] < time.time():
            return self.send(400, b"authorization request expired", "text/plain")
        if form.get("decision") != "approve":
            return self.redirect(txn["redirect_uri"], {"error": "access_denied", "state": txn["state"], "iss": ISSUER})
        subject = form.get("subject")
        if subject not in USERS:
            return self.send(400, b"unknown user", "text/plain")
        code = secrets.token_urlsafe(32)
        with lock:
            codes[digest(code)] = {**txn, "subject": subject, "expires": time.time() + CODE_TTL}
        self.redirect(txn["redirect_uri"], {"code": code, "state": txn["state"], "iss": ISSUER})

    def token(self, form):
        if not self.client_ok():
            return self.oauth_error(401, "invalid_client")
        grant_type = form.get("grant_type")
        with lock:
            if grant_type == "authorization_code":
                code = codes.pop(digest(form.get("code", "")), None)
                verifier = form.get("code_verifier", "")
                challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
                if (not code or code["expires"] < time.time() or code["redirect_uri"] != form.get("redirect_uri")
                        or not hmac.compare_digest(challenge, code["challenge"])):
                    return self.oauth_error(400, "invalid_grant")
                family_id = secrets.token_hex(16)
                families[family_id] = {"subject": code["subject"], "scope": code["scope"], "revoked": False,
                                       "authorized_at": time.time(), "refreshed_at": time.time()}
                print(f"grant {family_id[:8]} issued for {code['subject']}", flush=True)
                return self.send_json(200, issue(family_id))
            if grant_type == "refresh_token":
                entry = refresh_tokens.get(digest(form.get("refresh_token", "")))
                if not entry or entry["revoked"] or not family_alive(entry["family"]):
                    return self.oauth_error(400, "invalid_grant")
                if entry["used"]:
                    print(f"refresh reuse detected, revoking grant {entry['family'][:8]}", flush=True)
                    revoke_family(entry["family"])
                    return self.oauth_error(400, "invalid_grant")
                entry["used"] = True
                for key, value in access_tokens.items():
                    if value["family"] == entry["family"]:
                        value["revoked"] = True
                return self.send_json(200, issue(entry["family"]))
        self.oauth_error(400, "unsupported_grant_type")

    def revoke(self, form):
        if not self.client_ok():
            return self.oauth_error(401, "invalid_client")
        token = digest(form.get("token", ""))
        with lock:
            entry = refresh_tokens.get(token) or access_tokens.get(token)
            if entry:
                print(f"grant {entry['family'][:8]} revoked by client", flush=True)
                revoke_family(entry["family"])
        self.send(200)

    def revoke_subject(self, form):
        with lock:
            for family_id, family in families.items():
                if family["subject"] == form.get("subject"):
                    revoke_family(family_id)
        self.send_json(200, {"revoked_subject": form.get("subject")})

    def me(self):
        auth = self.headers.get("Authorization", "")
        with lock:
            entry = access_tokens.get(digest(auth[7:])) if auth.startswith("Bearer ") else None
            if not entry or entry["revoked"] or entry["expires"] < time.time() or not family_alive(entry["family"]):
                return self.api_error(401, "unauthorized")
            family = families[entry["family"]]
        body = {"contract_version": CONTRACT_VERSION, "issuer": ISSUER, "subject": family["subject"],
                "capabilities": ["collection.read", "decks.read", "events.replay"]}
        if "profile" in family["scope"].split():
            body["display_name"] = USERS[family["subject"]]
        self.send_json(200, body)


if __name__ == "__main__":
    port = int(os.environ.get("MOCK_PORT", "8790"))
    print(f"mock arcana on :{port} issuer={ISSUER}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
