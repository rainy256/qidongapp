"""Validate and sign without printing any signing credential."""
import base64
import binascii
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

class SigningError(Exception):
    pass

def require(value, label):
    if not isinstance(value, str) or not value:
        raise SigningError("Missing required field: " + label)
    return value

def decode64(text, label):
    # Accept copy/paste line wrapping and a UTF-8 BOM, but reject other characters.
    normalized = re.sub(r"\s+", "", text.lstrip("\ufeff"))
    try:
        return base64.b64decode(normalized, validate=True)
    except (ValueError, binascii.Error):
        raise SigningError(label + " is not valid Base64. Copy the full configuration file, not its filename.") from None

def read_config():
    bundle = os.environ.pop("ANDROID_SIGNING_BUNDLE", "").strip().lstrip("\ufeff")
    if bundle:
        print("Signing configuration: bundled Secret present", flush=True)
        try:
            raw = bundle if bundle.startswith("{") else decode64(bundle, "Signing bundle").decode("utf-8-sig")
            config = json.loads(raw)
        except (UnicodeError, json.JSONDecodeError):
            raise SigningError("Signing bundle is not valid JSON after decoding.") from None
        if not isinstance(config, dict) or config.get("version") != 1:
            raise SigningError("Unsupported signing bundle format.")
        encoded = require(config.get("keystore"), "keystore")
        password = require(config.get("password"), "password")
        alias = require(config.get("alias"), "alias")
        key_password = require(config.get("keyPassword"), "keyPassword")
    else:
        print("Signing configuration: bundled Secret absent; checking legacy configuration", flush=True)
        encoded = require(os.environ.get("KEYSTORE_B64"), "legacy keystore")
        password = require(os.environ.get("KEYSTORE_PASSWORD"), "legacy store password")
        alias = require(os.environ.get("KEY_ALIAS"), "legacy alias")
        key_password = require(os.environ.get("KEY_PASSWORD"), "legacy key password")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", alias):
        raise SigningError("Invalid key alias format.")
    keybytes = decode64(encoded, "Keystore")
    if len(keybytes) < 100:
        raise SigningError("Keystore data is incomplete.")
    print("Signing configuration decoded successfully", flush=True)
    return keybytes, password, alias, key_password

def checked(command, env, label):
    print("Checking: " + label, flush=True)
    try:
        result = subprocess.run(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    except OSError:
        raise SigningError(label + " could not start: executable or SDK missing.") from None
    if result.returncode:
        # Deliberately do not display tool output, which may contain aliases or credentials.
        raise SigningError(label + " failed (exit " + str(result.returncode) + ").") from None
    print("Passed: " + label, flush=True)

def main():
    keybytes, password, alias, key_password = read_config()
    with tempfile.TemporaryDirectory(prefix="qidong-sign-", dir=os.environ.get("RUNNER_TEMP")) as td:
        td = Path(td)
        keyfile = td / "release.jks"
        keyfile.write_bytes(keybytes)
        keyfile.chmod(0o600)
        env = dict(os.environ, QIDONG_STORE_PASSWORD=password, QIDONG_KEY_PASSWORD=key_password)
        for name in ("KEYSTORE_B64","KEYSTORE_PASSWORD","KEY_ALIAS","KEY_PASSWORD","ANDROID_SIGNING_BUNDLE"):
            env.pop(name, None)
        checked(["keytool", "-list", "-keystore", str(keyfile), "-alias", alias, "-storepass:env", "QIDONG_STORE_PASSWORD"], env, "keystore and store password")
        if "--check" in sys.argv:
            # Validate access to private key with a disposable archive.
            import zipfile
            archive = td / "check.jar"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("check.txt", "qidong signing verification")
            checked(["jarsigner", "-keystore", str(keyfile), "-storepass:env", "QIDONG_STORE_PASSWORD", "-keypass:env", "QIDONG_KEY_PASSWORD", str(archive), alias], env, "private key and key password")
            return
        tools = Path(os.environ["ANDROID_HOME"]) / "build-tools" / "35.0.0"
        unsigned = Path("android/app/build/outputs/apk/release/app-release-unsigned.apk")
        if not unsigned.is_file():
            candidates = sorted(unsigned.parent.glob("*.apk"))
            if len(candidates) != 1 or "unsigned" not in candidates[0].name:
                raise SigningError("Expected exactly one unsigned release APK in the Gradle output directory.")
            unsigned = candidates[0]
        output = Path("qidongapp.apk")
        aligned = td / "aligned.apk"
        checked([str(tools/"zipalign"), "-P", "16", "-f", "4", str(unsigned), str(aligned)], env, "APK alignment")
        checked([str(tools/"apksigner"), "sign", "--ks", str(keyfile), "--ks-key-alias", alias, "--ks-pass", "env:QIDONG_STORE_PASSWORD", "--key-pass", "env:QIDONG_KEY_PASSWORD", "--out", str(output), str(aligned)], env, "APK signature")
        checked([str(tools/"apksigner"), "verify", "--verbose", str(output)], env, "APK signature verification")
    Path("qidongapp.apk.sha256").write_text(hashlib.sha256(output.read_bytes()).hexdigest()+"  qidongapp.apk\n")

if __name__ == "__main__":
    try:
        main()
    except SigningError as exc:
        raise SystemExit("Signing failed: " + str(exc)) from None
    except Exception as exc:
        raise SystemExit("Signing failed: unexpected " + type(exc).__name__ + " (no credentials logged)") from None
