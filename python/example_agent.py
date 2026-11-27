"""Example: govern a Python tool call through the Permiscope sidecar."""

from permiscope import Permiscope, PermiscopeError

# Start the sidecar first:
#   PERMISCOPE_SIDECAR_TOKEN=dev-token npx permiscope serve

permiscope = Permiscope(token="dev-token")

decision = permiscope.decide("run_command", {"command": "echo hello"})
print(f"policy decision: {decision}")

if decision == "ALLOW":
    # Your real tool execution goes here.
    print("tool would run now")
else:
    print("blocked by policy")

try:
    result = permiscope.execute("run_command", {"command": "echo governed"})
    print(f"governed execution: {result}")
except PermiscopeError as error:
    print(f"sidecar error: {error}")
