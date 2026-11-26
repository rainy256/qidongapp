"""Generate PWA metadata, using the original artwork rather than replacing it."""
import json
from pathlib import Path
from PIL import Image
root=Path("dist-pwa")
html=root/"index.html"
s=html.read_text()
s=s.replace("</head>",'<link rel="manifest" href="/app/manifest.webmanifest"><link rel="apple-touch-icon" href="/app/icons/icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"></head>')
html.write_text(s)
icons=root/"icons"
icons.mkdir(exist_ok=True)
source=Image.open("public/art/hero-runner.png").convert("RGBA")
for size in (192,512):
    bg=Image.new("RGBA",(size,size),"#fffbf4")
    art=source.copy()
    art.thumbnail((int(size*.68),int(size*.68)),Image.Resampling.LANCZOS)
    bg.alpha_composite(art,((size-art.width)//2,(size-art.height)//2))
    bg.convert("RGB").save(icons/f"icon-{size}.png")
manifest={"id":"/app/","name":"启动！","short_name":"启动！","lang":"zh-CN","start_url":"/app/","scope":"/app/","display":"standalone","background_color":"#fffbf4","theme_color":"#4e5cd6","icons":[{"src":f"/app/icons/icon-{size}.png","sizes":f"{size}x{size}","type":"image/png","purpose":"any"} for size in (192,512)]}
(root/"manifest.webmanifest").write_text(json.dumps(manifest,ensure_ascii=False))
(root/"sw.js").write_text(Path("product/pwa/sw.js").read_text())
(root/"offline.html").write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>启动！暂时离线</title><body style="font:16px system-ui;padding:24px;background:#fffbf4;color:#2f2622"><h1>暂时无法连接</h1><p>约局和日程需要联网，不会离线提交或显示旧的私人数据。</p><a href="/app/">重新连接</a></body></html>')
