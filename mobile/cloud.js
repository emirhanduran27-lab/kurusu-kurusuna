/* Bulut bağlantısı: Supabase istemcisini sarar. esbuild ile renderer/vendor/cloud.js olarak paketlenir.
   Uygulama sadece bu dar arayüzü kullanır; testlerde aynı arayüze sahip sahte bir sunucu konur. */
import { createClient } from '@supabase/supabase-js';

const REDIRECT = 'kurusukurusuna://auth';

window.KKCloud = {
  create(url, key) {
    const sb = createClient(url, key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'kk-auth' }
    });
    const err = e => { if (e) throw new Error(e.message || String(e)); };
    return {
      async session() { const { data } = await sb.auth.getSession(); return data.session ? { userId: data.session.user.id, email: data.session.user.email } : null; },
      onAuth(cb) { sb.auth.onAuthStateChange((ev, s) => cb(ev, s ? { userId: s.user.id, email: s.user.email } : null)); },
      async signUp(email, password) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: REDIRECT } }); err(error);
        return { needsConfirm: !data.session };
      },
      async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); err(error); },
      async signOut() { await sb.auth.signOut({ scope: 'local' }); },
      async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT }); err(error); },
      async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); err(error); },
      async oauthUrl(provider) {
        const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: REDIRECT, skipBrowserRedirect: true } }); err(error);
        return data.url;
      },
      // kurusukurusuna://auth?code=... bağlantısı uygulamaya döndüğünde
      async handleCallback(link) {
        const u = new URL(link);
        const q = new URLSearchParams(u.search || u.hash.replace(/^#/, ''));
        if (q.get('error_description')) throw new Error(q.get('error_description'));
        const code = q.get('code');
        if (!code) return null;
        const { data, error } = await sb.auth.exchangeCodeForSession(code); err(error);
        return { recovery: q.get('type') === 'recovery', userId: data.session?.user.id };
      },
      async getVault(userId) {
        const { data, error } = await sb.from('vault').select('*').eq('user_id', userId).maybeSingle(); err(error);
        return data;
      },
      async putVault(row) { const { error } = await sb.from('vault').upsert(row, { onConflict: 'user_id' }); err(error); },
      async pull(userId, cursor, limit = 500) {
        let q = sb.from('records').select('id,kind,data,deleted,modified,updated_at').eq('user_id', userId).order('updated_at', { ascending: true }).limit(limit);
        if (cursor) q = q.gte('updated_at', cursor);
        const { data, error } = await q; err(error);
        return data || [];
      },
      async push(rows) { if (!rows.length) return; const { error } = await sb.from('records').upsert(rows, { onConflict: 'user_id,id' }); err(error); },
      async deleteAccount() { const { error } = await sb.rpc('delete_my_account'); err(error); await sb.auth.signOut({ scope: 'local' }); }
    };
  }
};
