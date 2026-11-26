"""Verify the signed candidate is an in-place upgrade of the previous APK."""
import os
from pathlib import Path
import re
import subprocess
import sys

tools = Path(os.environ["ANDROID_HOME"]) / "build-tools" / "35.0.0"
old, new = map(Path, sys.argv[1:])
def metadata(apk):
    data = subprocess.check_output([str(tools / "aapt"), "dump", "badging", str(apk)], text=True)
    match = re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", data, re.M)
    if not match:
        raise SystemExit("Cannot read APK package/version")
    return match[1], int(match[2]), match[3]
def signer(apk):
    data = subprocess.check_output([str(tools / "apksigner"), "verify", "--print-certs", str(apk)], text=True)
    digests = sorted(re.findall(r"certificate SHA-256 digest: ([0-9a-fA-F]+)", data))
    if not digests:
        raise SystemExit("No verified signing certificate")
    return digests
old_meta, new_meta = metadata(old), metadata(new)
expected = "com.rainy256.qidongapp"
if old_meta[0] != expected or new_meta[0] != expected:
    raise SystemExit("APK package name changed")
if new_meta[1] <= old_meta[1] or new_meta[2] != os.environ["VITE_APP_VERSION"]:
    raise SystemExit("Candidate version must exceed previous release and match expected version")
if signer(old) != signer(new):
    raise SystemExit("Release certificate changed; cannot safely install over existing APK")
print(f"Verified package {expected}; {old_meta[2]} ({old_meta[1]}) -> {new_meta[2]} ({new_meta[1]}); signing certificates match")
