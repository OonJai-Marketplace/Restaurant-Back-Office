/* Staff sessions stay in Restaurant storage. Only a server-verified active
   administrator reuses Accounting's standard Supabase session on this origin. */
(()=>{'use strict';let shared=false;const project=()=>new URL(OJM_SUPABASE_URL).hostname.split('.')[0],staffKey=()=>`oonjai-restaurant-${project()}-auth123`,sharedKey=()=>`sb-${project()}-auth-token`;
const client=key=>supabase.createClient(OJM_SUPABASE_URL,OJM_SUPABASE_ANON_KEY,key?{auth:{storageKey:key}}:{});
function stop(c){c?.auth.stopAutoRefresh();if(typeof c?.auth.dispose==='function')c.auth.dispose()}
async function serverAdmin(c){const out=await c.rpc('is_admin');if(out.error||out.data!==true)return false;const identity=await c.auth.getUser();if(identity.error||!identity.data.user)return false;const p=await c.from('profiles').select('role,status').eq('id',identity.data.user.id).single();return !p.error&&p.data?.role==='admin'&&p.data.status==='active'}
async function connect({recovery=false}={}){shared=false;if(recovery)return client(staffKey());let stored=false;try{stored=!!localStorage.getItem(sharedKey())}catch{}if(stored){const candidate=client();try{const s=await candidate.auth.getSession();if(s.data?.session&&await serverAdmin(candidate)){shared=true;return candidate}}catch{}stop(candidate)}return client(staffKey())}
async function promote(session){const target=client();try{const imported=await target.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});if(imported.error)throw imported.error;if(!await serverAdmin(target))throw Error('Administrator access could not be verified.');localStorage.removeItem(staffKey());stop(ojmDb);shared=true;location.reload();return true}catch(e){stop(target);throw e}}
window.restaurantAuth123={connect,promote,get shared(){return shared}};
})();
