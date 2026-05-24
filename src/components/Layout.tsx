import { type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

export default function Layout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 pb-16">
        {children ?? <Outlet />}
      </div>
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t flex">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-black' : 'text-gray-400'}`
          }
        >
          Today
        </NavLink>
        <NavLink
          to="/habits"
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-black' : 'text-gray-400'}`
          }
        >
          Manage habits
        </NavLink>
      </nav>
    </div>
  )
}
