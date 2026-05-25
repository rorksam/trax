import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function VerifyEmailPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && session) navigate('/', { replace: true })
  }, [session, loading, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm text-center space-y-3">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-sm text-gray-500">
          We sent a confirmation link to your email address. Click it to continue.
        </p>
        <p className="text-xs text-gray-400">
          This page will advance automatically once you confirm.
        </p>
      </div>
    </div>
  )
}
