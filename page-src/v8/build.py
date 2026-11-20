import re,subprocess,pathlib,sys
d=pathlib.Path(__file__).resolve().parent; root=d.parent
sys.path.insert(0,str(d)); import scenes
h=(root/'index-v8.html').read_text()
secs,realjs=scenes.build()
a=h.index('<!-- ============ image ============ -->'); b=h.index('<section class="wrap history"')
h=h[:a]+secs+'\n\n'+h[b:]
css=(d/'v7.css').read_text().replace('../img/','img/')+'\n'+(d/'engine-hero.css').read_text()+'\n'+(d/'wipe-scene.css').read_text()+'\n'+(d/'engine-s12.css').read_text()+'\n'+(d/'engine-s7.css').read_text()+'\n'+(d/'history.css').read_text()+'\n'+(d/'theme-light.css').read_text()+'\n'+(d/'focus.css').read_text()+'\n'+(d/'gallery.css').read_text()+'\n'+(d/'texttab.css').read_text()+'\n'+(d/'opts1120.css').read_text()+'\n'+(d/'download.css').read_text()+'\n'+(d/'arch.css').read_text()+'\n'+(d/'faq.css').read_text()+'\n'+(d/'polish1120.css').read_text()
js=(d/'v7.js').read_text()+'\n'+(d/'engine-hero.js').read_text()+'\n'+realjs+'\n'+(d/'real-player.js').read_text()+'\n'+(d/'engine-s34.js').read_text()+'\n'+(d/'engine-s7.js').read_text()+'\n'+(d/'engine-s12.js').read_text()+'\n'+(d/'focus.js').read_text()+'\n'+(d/'texttab.js').read_text()+'\n'+(d/'opts1120.js').read_text()+'\n'+(d/'download.js').read_text()+'\n'+(d/'arch.js').read_text()+'\n'+(d/'faq.js').read_text()+'\n'+(d/'mkpill.js').read_text()+'\n'+(d/'kbd.js').read_text()+'\n'+(d/'navsync.js').read_text()
h=h.replace('<link rel="stylesheet" href="v8/v7.css">','<style>\n'+css+'\n</style>')
h=h.replace('<script src="v8/v7.js"></script>','<script>\n'+js+'\n</script>')
h=h.replace('__MASK__',(d/'mask.txt').read_text().strip()).replace('__HOLE__',(d/'hole.txt').read_text().strip())
(d/'_flat.html').write_text(h)
subprocess.run(['python3',str(pathlib.Path.home()/'Projects/mockup/skills/mockup/scripts/bundle.py'),str(d/'_flat.html'),'-o',str(root/'5e-landing-v8.html')],check=True)
