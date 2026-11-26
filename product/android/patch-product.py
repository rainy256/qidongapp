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
