import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import OnboardingPage from './pages/OnboardingPage'
import LoggingPage from './pages/LoggingPage'
import HabitsPage from './pages/HabitsPage'
import FriendsPage from './pages/FriendsPage'
import InvitePage from './pages/InvitePage'
import FeedPage from './pages/FeedPage'
import SettingsPage from './pages/SettingsPage'
import VerifyEmailPage from './pages/VerifyEmailPage'

function ProtectedLayout() {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (!profile?.timezone) return <Navigate to="/onboarding" replace />
  return <Layout><Outlet /></Layout>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/signup"        element={<SignupPage />} />
          <Route path="/onboarding"    element={<OnboardingPage />} />
          <Route path="/invite/:token"  element={<InvitePage />} />
          <Route path="/verify-email"  element={<VerifyEmailPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/"         element={<LoggingPage />} />
            <Route path="/habits"   element={<HabitsPage />} />
            <Route path="/friends"  element={<FriendsPage />} />
            <Route path="/feed"     element={<FeedPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
