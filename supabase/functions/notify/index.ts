// Sends a web push to the recipient's devices. Deploy: supabase functions deploy notify --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const hits = new Map<string, number[]>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    const me = u?.user;
    if (!me) return json({ error: 'unauthorized' }, 401);

    const { to, kind, video } = await req.json();
    if (typeof to !== 'string' || !['message', 'call'].includes(kind) || to === me.id) return json({ error: 'bad request' }, 400);

    // basic abuse limit: 12 pushes per minute per sender
    const now = Date.now();
    const recent = (hits.get(me.id) ?? []).filter((t) => now - t < 60000);
    if (recent.length >= 12) return json({ sent: 0, limited: true });
    recent.push(now);
    hits.set(me.id, recent);

    const { data: prof } = await admin.from('profiles').select('username').eq('id', me.id).single();
    const name = prof?.username ?? 'Someone';

    let body = '';
    if (kind === 'call') {
      body = video ? 'Incoming video call' : 'Incoming voice call';
    } else {
      // only notify for a message that was really just sent, and build the text on the server
      const { data: m } = await admin.from('messages')
        .select('body,image_url,audio_url,created_at')
        .eq('sender_id', me.id).eq('recipient_id', to)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!m || now - new Date(m.created_at).getTime() > 120000) return json({ sent: 0 });
      body = m.audio_url && !m.body ? 'Sent a voice message' : m.image_url && !m.body ? 'Sent a photo' : (m.body || '').slice(0, 120);
    }

    const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', to);
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
    const payload = JSON.stringify({
      title: name, body, kind, from: me.id, video: !!video,
      tag: `${kind}-${me.id}`, url: `./?${kind === 'call' ? 'call' : 'chat'}=${me.id}`,
    });

    let sent = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: kind === 'call' ? 30 : 3600, urgency: kind === 'call' ? 'high' : 'normal' },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }));
    return json({ sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
