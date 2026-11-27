import io
import json
import unittest
import urllib.error
from unittest.mock import patch

from permiscope import Permiscope, PermiscopeError


class FakeResponse:
    def __init__(self, payload):
        self._data = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class PermiscopeClientTests(unittest.TestCase):
    def setUp(self):
        self.client = Permiscope(base_url="http://127.0.0.1:8787", token="test-token")

    def test_requires_token(self):
        with self.assertRaises(ValueError):
            Permiscope(token=None)

    def test_decide_sends_token_and_returns_decision(self):
        with patch("urllib.request.urlopen", return_value=FakeResponse({"decision": "ALLOW"})) as mocked:
            decision = self.client.decide("run_command", {"command": "echo hi"})
        self.assertEqual(decision, "ALLOW")
        request = mocked.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:8787/v1/decide")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")

    def test_allowed_helper(self):
        with patch("urllib.request.urlopen", return_value=FakeResponse({"decision": "BLOCK"})):
            self.assertFalse(self.client.allowed("run_command", {"command": "rm -rf /"}))

    def test_execute_returns_result(self):
        payload = {"decision": "ALLOW", "success": True, "output": "hello"}
        with patch("urllib.request.urlopen", return_value=FakeResponse(payload)):
            result = self.client.execute("run_command", {"command": "echo hello"})
        self.assertEqual(result, payload)

    def test_http_error_becomes_permiscope_error(self):
        error = urllib.error.HTTPError(
            "http://127.0.0.1:8787/v1/decide", 401, "Unauthorized", {}, io.BytesIO(b"nope")
        )
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(PermiscopeError):
                self.client.decide("run_command", {})


if __name__ == "__main__":
    unittest.main()
