from pathlib import Path
import shutil
root=Path("android/app/src/main")
pkg=root/"java/com/rainy256/qidongapp"
assert (pkg/"MainActivity.java").exists()
shutil.copyfile("product/android/SecureSessionPlugin.java",pkg/"SecureSessionPlugin.java")
p=pkg/"MainActivity.java"
s=p.read_text()
assert "extends BridgeActivity" in s
if "SecureSessionPlugin.class" not in s:
    s=s.replace("extends BridgeActivity {","extends BridgeActivity {\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(SecureSessionPlugin.class);\n        super.onCreate(savedInstanceState);\n    }")
assert "registerPlugin(SecureSessionPlugin.class)" in s
p.write_text(s)
m=root/"AndroidManifest.xml"
s=m.read_text()
import re
s=re.sub(r'android:allowBackup="[^"]+"','android:allowBackup="false"',s)
if 'android:allowBackup=' not in s:
    s=s.replace("<application","<application android:allowBackup=\"false\"",1)
m.write_text(s)

# The same release version must be embedded in the APK and Vite build.
import os
version=os.environ.get("VITE_APP_VERSION","0.1.0")
assert re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)",version)
major,minor,patch=map(int,version.split("."))
assert major<=2000 and minor<=999 and patch<=999
code=major*1000000+minor*1000+patch
assert code>0
gradle=Path("android/app/build.gradle")
s=gradle.read_text()
s,n=re.subn(r"versionCode\s+\d+",f"versionCode {code}",s,count=1)
assert n==1
s,n=re.subn(r'versionName\s+["\'][^"\']+["\']',f'versionName "{version}"',s,count=1)
assert n==1
gradle.write_text(s)
