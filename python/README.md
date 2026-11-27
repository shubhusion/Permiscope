# Permiscope Python SDK

A dependency-free client for the Permiscope governance sidecar. It uses only the
Python standard library.

## Start the sidecar

```bash
PERMISCOPE_SIDECAR_TOKEN=dev-token npx permiscope serve
```

It binds to `127.0.0.1:8787` by default. Override with `PERMISCOPE_SIDECAR_HOST`
and `PERMISCOPE_SIDECAR_PORT`. Non-loopback binding is refused unless the sidecar
is created programmatically with `allowRemote: true`.

## Use it

```python
from permiscope import Permiscope

scope = Permiscope(token="dev-token")

decision = scope.decide("run_command", {"command": "echo hello"})
if scope.allowed("read_file", {"path": "config.json"}):
    ...

result = scope.execute("run_command", {"command": "echo governed"})
print(result["decision"], result["success"])
```

See `example_agent.py` for a complete example.

## API

- `decide(action_name, parameters=None, reason=None) -> str` — policy decision only.
- `allowed(...) -> bool` — convenience wrapper for `decide(...) == "ALLOW"`.
- `execute(...) -> dict` — governed execution with `{ decision, success, output, error }`.
- `PermiscopeError` — raised on HTTP errors, unreachable sidecar, or invalid JSON.
