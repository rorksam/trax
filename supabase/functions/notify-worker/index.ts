// @ts-types="npm:@types/web-push"
import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CRON_SECRET   = Deno.env.get('CRON_SECRET')          ?? ''
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')     ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')    ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')        ?? 'mailto:admin@example.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type NotifType = 'evening' | 'morning' | 'sunday_review'

const CONTENT: Record<NotifType, { title: string; body: string; url: string }> = {
  evening:       { title: 'Time to log',           body: 'How did today go? Log your habits.',                url: '/'  },
  morning:       { title: 'Yesterday\'s habits',   body: 'Some habits went unlogged. Backfill before noon.', url: '/'  },
  sunday_review: { title: 'Your week at a glance', body: 'See how the week went.',                           url: '/'  },
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: pending, error: fetchError } = await admin.rpc('find_pending_notifications')
  if (fetchError) {
    console.error('find_pending_notifications:', fetchError)
    return new Response('DB error', { status: 500 })
  }

  let sent = 0, failed = 0

  for (const row of (pending ?? []) as Array<{
    user_id: string; notification_type: NotifType; fire_date: string; timezone: string
  }>) {
    const content = CONTENT[row.notification_type]
    if (!content) continue

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key')
      .eq('user_id', row.user_id)

    for (const sub of (subs ?? []) as Array<{
      id: string; endpoint: string; p256dh_key: string; auth_key: string
    }>) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
          JSON.stringify(content),
        )
        sent++
      } catch (err) {
        const e = err as { statusCode?: number }
        if (e.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('push send error:', err)
          failed++
        }
      }
    }

    await admin.from('notifications_log').upsert(
      { user_id: row.user_id, notification_type: row.notification_type, fire_date: row.fire_date },
      { onConflict: 'user_id,notification_type,fire_date', ignoreDuplicates: true },
    )
  }

  return new Response(
    JSON.stringify({ processed: (pending ?? []).length, sent, failed }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
