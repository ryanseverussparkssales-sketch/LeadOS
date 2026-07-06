import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=') && !l.trim().startsWith('#'))
    .map(l=>{const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];})
);
const URL = env.PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_KEY;
const ANON = env.PUBLIC_SUPABASE_ANON_KEY;

const EMAIL='min@test.com', PASS='password';
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken:false, persistSession:false }});

// 1. create or find user
let userId;
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email: EMAIL, password: PASS, email_confirm: true
});
if (cErr) {
  if (/already|registered|exist/i.test(cErr.message)) {
    // find existing
    const { data: list } = await admin.auth.admin.listUsers({ page:1, perPage:1000 });
    const u = list.users.find(x=>x.email===EMAIL);
    if (!u) { console.error('User exists but not found:', cErr.message); process.exit(1); }
    userId = u.id;
    await admin.auth.admin.updateUserById(userId, { password: PASS, email_confirm: true });
    console.log('EXISTING user updated:', userId);
  } else { console.error('createUser error:', cErr.message); process.exit(1); }
} else {
  userId = created.user.id;
  console.log('CREATED user:', userId);
}

// 2. user_settings (agency owner)
const { error: sErr } = await admin.from('user_settings').upsert(
  { user_id: userId, agency_name:'Min Test Agency', company_name:'Min Test', company_email: EMAIL, subscription_tier:'agency' },
  { onConflict: 'user_id' }
);
console.log('user_settings:', sErr ? 'ERR '+sErr.message : 'ok');

// ensure no team_members row makes them route as owner -> /dashboard (owner has no team_members entry)

// 3. verify login with anon
const pub = createClient(URL, ANON, { auth:{ persistSession:false }});
const { data: sess, error: lErr } = await pub.auth.signInWithPassword({ email:EMAIL, password:PASS });
console.log('LOGIN:', lErr ? 'FAILED '+lErr.message : 'SUCCESS session='+!!sess.session);
