/* Restaurant authentication belongs exclusively to the Restaurant project. */
(()=>{'use strict';
 const project=()=>new URL(OJM_SUPABASE_URL).hostname.split('.')[0];
 const storageKey=()=>`oonjai-restaurant-${project()}-auth123`;
 let client;
 window.restaurantAuth123={connect:async()=>client||(client=supabase.createClient(OJM_SUPABASE_URL,OJM_SUPABASE_ANON_KEY,{auth:{storageKey:storageKey()}}))};
})();
