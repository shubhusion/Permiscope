"""Tiny stdlib-only client for the Permiscope governance sidecar."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

__all__ = ["Permiscope", "PermiscopeError"]


class PermiscopeError(Exception):
    """Raised when the sidecar cannot be reached or rejects a request."""


class Permiscope:
    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8787",
        token: Optional[str] = None,
        timeout: float = 10.0,
    ) -> None:
        if not token:
            raise ValueError("A sidecar bearer token is required")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def decide(
        self,
        action_name: str,
        parameters: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None,
    ) -> str:
        """Ask the sidecar for a policy decision without executing anything."""
        payload = self._payload(action_name, parameters, reason)
        response = self._post("/v1/decide", payload)
        return str(response["decision"])

    def execute(
        self,
        action_name: str,
        parameters: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ask the sidecar to govern and execute a built-in action."""
        return self._post("/v1/execute", self._payload(action_name, parameters, reason))

    def allowed(
        self,
        action_name: str,
        parameters: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None,
    ) -> bool:
        return self.decide(action_name, parameters, reason) == "ALLOW"

    @staticmethod
    def _payload(
        action_name: str,
        parameters: Optional[Dict[str, Any]],
        reason: Optional[str],
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "actionName": action_name,
            "parameters": parameters or {},
        }
        if reason:
            payload["reason"] = reason
        return payload

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        request = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise PermiscopeError(f"HTTP {error.code}: {body}") from error
        except urllib.error.URLError as error:
            raise PermiscopeError(f"Cannot reach Permiscope sidecar: {error.reason}") from error
        except json.JSONDecodeError as error:
            raise PermiscopeError("Sidecar returned invalid JSON") from error
