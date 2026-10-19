"""Build the checked-in release. Dependency: tinycss2==1.4.0.
Legacy source files remain readable; only these compiled assets are loaded.
"""
from pathlib import Path
import re
import tinycss2
ROOT=Path(__file__).resolve().parents[1]
def read(p):return (ROOT/p).read_text()
def write(p,s):(ROOT/p).write_text(s)
styles=['styles.css','polish-v113.css','final-v117.css','final-v118.css','shared-v108.css','restaurant-backoffice.css','restaurant-v121.css','accounting-navigation122.css','restaurant-shell122.css','restaurant-compact124.css','restaurant-website128.css','restaurant-layout130.css','menu-display131.css','restaurant-mobile132.css','restaurant-cleanup133.css','kitchen134.css','restaurant-home139.css']
auth=re.compile(r'(?:#(?:loginGate|restaurantLogin|loginError|restaurantLoading132)|\.(?:login[-\w]*|restaurant-login|loading-orbit1444))')
def clean_rules(rules):
 out=[]
 for r in rules:
  if r.type=='qualified-rule':
   selectors=[];current=[]
   for t in r.prelude:
    if t.type=='literal' and t.value==',':selectors.append(current);current=[]
    else:current.append(t)
   selectors.append(current)
   kept=[]
   for tokens in selectors:
    s=tinycss2.serialize(tokens).strip()
    # Preserve the dialog half of legacy combined mobile selectors.
    s=s.replace(',.restaurant-login','').replace('.restaurant-login,','')
    if not auth.search(s):kept.append(s)
   if kept:out.append(','.join(kept)+'{'+tinycss2.serialize(r.content)+'}')
  elif r.type=='at-rule' and r.content is not None and r.lower_at_keyword in ('media','supports','layer','container'):
   inner=clean_rules(tinycss2.parse_rule_list(r.content,skip_whitespace=True,skip_comments=True))
   if inner:out.append('@'+r.at_keyword+' '+tinycss2.serialize(r.prelude)+'{'+inner+'}')
  elif r.type!='error':out.append(tinycss2.serialize([r]))
  else:raise ValueError(str(r))
 return '\n'.join(line.rstrip() for line in '\n'.join(out).splitlines())
write('styles/restaurant-shell142.bundle.css','/* Generated; edit source styles and rebuild. Login rules are owned by the inline login stylesheet. */\n'+ '\n'.join(clean_rules(tinycss2.parse_stylesheet(read('styles/'+f),skip_whitespace=True,skip_comments=True)) for f in styles))
core=['vendor/supabase-2.118.0.js','scripts/supabase-config.js','scripts/workspace-config123.js','scripts/restaurant-auth123.js','scripts/restaurant-backoffice.js','scripts/restaurant-permissions125.js','scripts/restaurant-modules125.js','scripts/restaurant-shell122.js','scripts/workspace-links123.js','scripts/restaurant-accounting124.js','scripts/restaurant-home139.js']
def bundle(target,files,prefix='',suffix=''):
 write(target,'/* Generated; edit source files and rebuild. */\n'+prefix+'\n'+ '\n;\n'.join('/* '+f+' */\n'+read(f) for f in files)+'\n;\n'+suffix)
bundle('scripts/restaurant-core142.bundle.js',core,'window.restaurantBootLoading126=true;','window.restaurantBootLoading126=false;document.dispatchEvent(new Event("restaurant:boot126"));window.restaurantCoreReady142=true;')
for group,files in {'inventory':['inventory-menu-v104.js','item-icons-v109.js','restaurant-integration132.js'],'settings':['public-content127.js','restaurant-settings125.js'],'pos':['pos-offline-v119.js','pos-performance125.js','pos-v118.js']}.items():bundle('scripts/restaurant-'+group+'142.bundle.js',['scripts/'+f for f in files])
for file in ['index.html','back-office/index.html']:
 s=read(file)
 # First build replaces the previous external entry; subsequent builds replace marked inline blocks.
 s=re.sub(r'<style id="restaurant(?:Login|Shell)Style\d+">.*?</style>','',s,flags=re.S)
 s=re.sub(r'<script id="restaurantBoot\d+">.*?</script>','',s,flags=re.S)
 s=re.sub(r'<link\b[^>]*href="styles/[^\"]+"[^>]*>','',s)
 s=re.sub(r'<script src="scripts/restaurant-release\d+\.js[^\"]*"></script>','',s)
 s=s.replace('</head>','<style id="restaurantShellStyle142">'+read('styles/restaurant-shell142.bundle.css')+'</style>\n<style id="restaurantLoginStyle142">'+read('styles/restaurant-login141.css')+'</style></head>')
 # Do not wait for remote fonts to parse the document or start authentication.
 s=re.sub(r'<link href="(https://fonts.googleapis.com/css2[^"]+)"[^>]*>',lambda m: '<link href="'+m[1]+'" media="print" onload="this.media=\'all\'" rel="stylesheet"/>',s)
 s=s.replace('class="login-submit" disabled','class="login-submit"').replace('type="button" disabled>Forgot password?','type="button">Forgot password?')
 s=s.replace('>Loading sign-in…</p>','></p>')
 s=re.sub(r'content="2026-10-19-[^\"]+"','content="2026-10-19-startup-audit-142"',s,count=1)
 s=s.replace('</body>','<script id="restaurantBoot142">'+read('scripts/restaurant-bootstrap142.js')+'</script></body>')
 s=re.sub(r'\n{3,}', '\n\n',s)
 write(file,s)
print('Built release 142: one core script, inline shell stylesheet, three module bundles; login styles inline.')
