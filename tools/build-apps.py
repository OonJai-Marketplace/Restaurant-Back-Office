"""Retain the original Back Office URL from the canonical named app entry."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
source=(root/'back-office/index.html').read_text()
assert source.count('<base href="../">')==1
output=source.replace('\n<base href="../">','',1)
if '--check' in sys.argv:
 assert (root/'index.html').read_text()==output,'Run python tools/build-apps.py'
else:
 (root/'index.html').write_text(output)
print('Back Office entry and root compatibility page agree')
