"""Assemble le build en une seule page HTML autonome (CSS et JS intégrés), prête à publier sur claude.ai.

Usage : python3 scripts/assembler-apercu.py <fichier de sortie> <titre de la page>
"""
import glob
import pathlib
import sys

racine = pathlib.Path(__file__).resolve().parent.parent
css = ''.join(pathlib.Path(p).read_text() for p in glob.glob(str(racine / 'dist-preview/assets/*.css')))
js = ''.join(pathlib.Path(p).read_text() for p in glob.glob(str(racine / 'dist-preview/assets/*.js')))
js = js.replace('</script', '<\\/script')


def ascii_js(texte: str) -> str:
    """Échappe les caractères non ASCII (\\uXXXX, paires de substitution au-delà) : valide dans les chaînes et les regex."""
    sortie = []
    for c in texte:
        n = ord(c)
        if n < 128:
            sortie.append(c)
        elif n <= 0xFFFF:
            sortie.append(f'\\u{n:04x}')
        else:
            n -= 0x10000
            sortie.append(f'\\u{0xD800 + (n >> 10):04x}\\u{0xDC00 + (n & 0x3FF):04x}')
    return ''.join(sortie)


js = ascii_js(js)
titre = sys.argv[2]

page = f"""<meta charset="utf-8">
<title>{titre}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&display=swap">
<style>{css}</style>
<div id="root"></div>
<script type="module">{js}</script>
"""
sortie = racine / sys.argv[1]
sortie.parent.mkdir(parents=True, exist_ok=True)
sortie.write_text(page)
print(f'{sortie} — {len(page) // 1024} Ko')
