"""Sign with one bundled repository Secret, or the legacy four Secrets."""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

def required(value):
    if not isinstance(value, str) or not value:
        raise ValueError("Missing signing configuration")
    return value

def main():
    bundle = os.environ.pop("ANDROID_SIGNING_BUNDLE", "")
    if bundle:
        config = json.loads(base64.b64decode(bundle.strip(), validate=True))
        if config.get("version") != 1:
            raise ValueError("Unsupported signing bundle")
        encoded = required(config.get("keystore"))
        password = required(config.get("password"))
        alias = required(config.get("alias"))
        key_password = required(config.get("keyPassword"))
    else:
        encoded = required(os.environ.get("KEYSTORE_B64"))
        password = required(os.environ.get("KEYSTORE_PASSWORD"))
        alias = required(os.environ.get("KEY_ALIAS"))
        key_password = required(os.environ.get("KEY_PASSWORD"))
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", alias):
        raise ValueError("Invalid signing alias")
    tools = Path(os.environ["ANDROID_HOME"]) / "build-tools" / "35.0.0"
    unsigned = Path("android/app/build/outputs/apk/release/app-release-unsigned.apk")
    output = Path("qidongapp.apk")
    with tempfile.TemporaryDirectory(prefix="qidong-sign-", dir=os.environ.get("RUNNER_TEMP")) as td:
        td = Path(td)
        keyfile = td / "release.jks"
        keyfile.write_bytes(base64.b64decode(encoded, validate=True))
        keyfile.chmod(0o600)
        aligned = td / "aligned.apk"
        env = dict(os.environ, QIDONG_STORE_PASSWORD=password, QIDONG_KEY_PASSWORD=key_password)
        for name in ("KEYSTORE_B64","KEYSTORE_PASSWORD","KEY_ALIAS","KEY_PASSWORD","ANDROID_SIGNING_BUNDLE"):
            env.pop(name, None)
        subprocess.run([str(tools/"zipalign"), "-P", "16", "-f", "4", str(unsigned), str(aligned)], check=True, env=env)
        subprocess.run([str(tools/"apksigner"), "sign", "--ks", str(keyfile), "--ks-key-alias", alias, "--ks-pass", "env:QIDONG_STORE_PASSWORD", "--key-pass", "env:QIDONG_KEY_PASSWORD", "--out", str(output), str(aligned)], check=True, env=env)
        subprocess.run([str(tools/"apksigner"), "verify", "--verbose", str(output)], check=True, env=env)
    import hashlib
    Path("qidongapp.apk.sha256").write_text(hashlib.sha256(output.read_bytes()).hexdigest()+"  qidongapp.apk\n")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never expose raw configuration in errors or tracebacks.
        raise SystemExit("Signing failed. Check the signing Secret and Android build tools.")
