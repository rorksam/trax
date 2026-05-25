import { supabase } from './supabase'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function subscribeToPush(): Promise<'subscribed' | 'denied' | 'unsupported'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidKey) return 'unsupported'

  const reg = await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'

    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
  }

  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'unsupported'

  await supabase.from('push_subscriptions').upsert(
    {
      user_id:     session.user.id,
      endpoint:    json.endpoint,
      p256dh_key:  json.keys.p256dh,
      auth_key:    json.keys.auth,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  return 'subscribed'
}
