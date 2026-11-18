import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createResetHandler } from './handler.ts';
Deno.serve(createResetHandler({createClient,url:Deno.env.get('SUPABASE_URL')!,anon:Deno.env.get('SUPABASE_ANON_KEY')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,nonce:()=>crypto.randomUUID()}));
