"""Export public-only PWA assets as small text chunks for the deployment connector."""
import base64, json, mimetypes, io, shutil
from pathlib import Path
from PIL import Image
root=Path("dist-pwa")
out=root/"transfer"
if out.exists(): shutil.rmtree(out)
out.mkdir()
manifest=[]
for path in sorted(root.rglob("*")):
    if not path.is_file() or out in path.parents: continue
    key=path.relative_to(root).as_posix()
    if not key.startswith(("assets/","art/","icons/")) and key not in ("index.html","manifest.webmanifest","sw.js","offline.html"): continue
    data=path.read_bytes()
    mime=mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if key.startswith("art/"):
        # Resize only the PWA copy; APK and original website retain exact artwork.
        img=Image.open(path).convert("RGBA")
        img.thumbnail((1200,1200) if key.endswith(".jpg") else (512,512),Image.Resampling.LANCZOS)
        buf=io.BytesIO()
        img.save(buf,format="WEBP",quality=87,method=4)
        data=buf.getvalue()
        mime="image/webp"
    if key.endswith(".webmanifest"): mime="application/manifest+json"
    if key.endswith((".html",".js",".css",".webmanifest")): mime+="; charset=utf-8"
    encoded=base64.b64encode(data).decode("ascii")
    parts=[]
    for i in range(0,len(encoded),48000):
        name=f"{len(manifest):03d}-{i//48000:03d}.txt"
        (out/name).write_text(encoded[i:i+48000])
        parts.append("transfer/"+name)
    manifest.append({"key":key,"type":mime,"bytes":len(data),"parts":parts})
(out/"manifest.json").write_text(json.dumps(manifest))
print("Exported",len(manifest),"public files,",sum(x["bytes"] for x in manifest),"bytes")
