from pathlib import Path
p=Path("android/app/src/main/AndroidManifest.xml")
s=p.read_text()
anchor='</activity>'
assert s.count(anchor)==1
s=s.replace(anchor,'''<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="qidongapp" android:host="game" />
</intent-filter>
</activity>''')
p.write_text(s)
