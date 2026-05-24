import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Invite {
  token: string
  expires_at: string
}

interface Friend {
  id: string
  display_name: string | null
  friendship_created_at: string
}

export default function FriendsPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const justAdded = searchParams.get('added') === '1'

  const [invite, setInvite] = useState<Invite | null>(null)
  const [inviteLoading, setInviteLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [copied, setCopied] = useState(false)

  const [friends, setFriends] = useState<Friend[]>([])
  const [friendsLoading, setFriendsLoading] = useState(true)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const userId = profile!.id

  const loadInvite = useCallback(async () => {
    setInviteLoading(true)
    const { data } = await supabase
      .from('invites')
      .select('token, expires_at')
      .eq('created_by', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setInvite(data)
    setInviteLoading(false)
  }, [userId])

  const loadFriends = useCallback(async () => {
    setFriendsLoading(true)
    const { data: rows } = await supabase
      .from('friendships')
      .select('user_a_id, user_b_id, created_at')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)

    if (!rows || rows.length === 0) {
      setFriends([])
      setFriendsLoading(false)
      return
    }

    const friendIds = rows.map(r => r.user_a_id === userId ? r.user_b_id : r.user_a_id)
    const createdAtMap = Object.fromEntries(
      rows.map(r => [r.user_a_id === userId ? r.user_b_id : r.user_a_id, r.created_at])
    )

    const { data: profiles } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', friendIds)

    setFriends((profiles ?? []).map(p => ({
      id: p.id,
      display_name: p.display_name,
      friendship_created_at: createdAtMap[p.id],
    })))
    setFriendsLoading(false)
  }, [userId])

  useEffect(() => {
    loadInvite()
    loadFriends()
  }, [loadInvite, loadFriends])

  useEffect(() => {
    if (!justAdded) return
    const t = setTimeout(() => setSearchParams({}, { replace: true }), 4000)
    return () => clearTimeout(t)
  }, [justAdded, setSearchParams])

  async function generateInvite() {
    setGenerating(true)
    setGenerateError('')
    const { data, error } = await supabase.rpc('generate_invite')
    if (error) {
      console.error('generate_invite error:', error)
      setGenerateError(error.message)
    } else if (data) {
      setInvite({
        token: data as string,
        expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      })
    }
    setGenerating(false)
  }

  async function revokeInvite() {
    if (!invite) return
    await supabase
      .from('invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', invite.token)
    setInvite(null)
  }

  async function copyLink() {
    if (!invite) return
    const url = `${window.location.origin}/invite/${invite.token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function removeFriend(friendId: string) {
    setRemovingId(friendId)
    const a = userId < friendId ? userId : friendId
    const b = userId < friendId ? friendId : userId
    await supabase.from('friendships').delete().eq('user_a_id', a).eq('user_b_id', b)
    setFriends(prev => prev.filter(f => f.id !== friendId))
    setConfirmRemove(null)
    setRemovingId(null)
  }

  const inviteUrl = invite ? `${window.location.origin}/invite/${invite.token}` : ''
  const daysLeft = invite
    ? Math.max(1, Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / 86_400_000))
    : 0

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <h1 className="text-white text-2xl font-semibold mb-6">Friends</h1>

      {justAdded && (
        <div className="mb-4 px-4 py-3 bg-green-100 text-green-800 rounded-xl text-sm font-medium">
          Friend added successfully!
        </div>
      )}

      <div className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3">Invite link</h2>
        {inviteLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : invite ? (
          <>
            <div className="text-xs font-mono break-all bg-gray-50 rounded-lg px-3 py-2 mb-2 text-gray-600 select-all">
              {inviteUrl}
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''} · anyone with this link becomes your friend
            </p>
            <div className="flex gap-2">
              <button
                onClick={copyLink}
                className="flex-1 bg-black text-white py-2 rounded-lg text-sm font-medium"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                onClick={revokeInvite}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200"
              >
                Revoke
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3">
              Generate a link to share with friends. It expires after 3 days.
            </p>
            <button
              onClick={generateInvite}
              disabled={generating}
              className="w-full bg-black text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate invite link'}
            </button>
            {generateError && (
              <p className="text-red-600 text-xs mt-2">{generateError}</p>
            )}
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5">
        <h2 className="text-sm font-semibold mb-3">
          {friendsLoading || friends.length === 0 ? 'Friends' : `Friends (${friends.length})`}
        </h2>
        {friendsLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : friends.length === 0 ? (
          <p className="text-sm text-gray-400">No friends yet — share your invite link to get started.</p>
        ) : (
          <ul className="divide-y">
            {friends.map(friend => (
              <li key={friend.id} className="py-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate">{friend.display_name ?? 'Unknown'}</span>
                {confirmRemove === friend.id ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setConfirmRemove(null)}
                      className="text-sm px-3 py-1 rounded-lg border border-gray-200 text-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => removeFriend(friend.id)}
                      disabled={removingId === friend.id}
                      className="text-sm px-3 py-1 rounded-lg bg-red-600 text-white disabled:opacity-50"
                    >
                      {removingId === friend.id ? 'Removing…' : 'Confirm'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemove(friend.id)}
                    className="shrink-0 text-sm px-3 py-1 rounded-lg text-gray-400 border border-gray-200"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
