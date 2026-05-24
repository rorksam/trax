import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { storePendingInvite } from '../lib/invite'

const ERROR_MESSAGES: Record<string, string> = {
  not_found:   'This invite link is invalid.',
  revoked:     'This invite link has been revoked.',
  expired:     'This invite link has expired.',
  self_invite: "You can't accept your own invite link.",
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (authLoading || !token) return

    if (!session) {
      storePendingInvite(token)
      navigate('/login', { replace: true })
      return
    }

    supabase.rpc('accept_invite', { p_token: token }).then(({ data, error }) => {
      if (error) {
        setStatus('error')
        setErrorMsg('Something went wrong. Please try again.')
        return
      }
      const result = data as { ok?: boolean; error?: string }
      if (result.ok) {
        setStatus('success')
        setTimeout(() => navigate('/friends?added=1', { replace: true }), 1200)
      } else {
        setStatus('error')
        setErrorMsg(ERROR_MESSAGES[result.error ?? ''] ?? 'Something went wrong.')
      }
    })
  }, [authLoading, session, token, navigate])

  if (status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white text-sm">Accepting invite…</p>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm text-center">
          <p className="text-lg font-semibold">Friend added!</p>
          <p className="text-sm text-gray-500 mt-1">Taking you to your friends list…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm text-center">
        <p className="text-lg font-semibold">Invite error</p>
        <p className="text-sm text-gray-500 mt-2">{errorMsg}</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="mt-6 w-full bg-black text-white py-2 rounded-lg text-sm font-medium"
        >
          Go to app
        </button>
      </div>
    </div>
  )
}
