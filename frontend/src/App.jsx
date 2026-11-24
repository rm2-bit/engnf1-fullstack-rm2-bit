import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Spinner } from './components/ui.jsx';
import AdminAnalytics from './pages/AdminAnalytics.jsx';
import AdminBookings from './pages/AdminBookings.jsx';
import AdminResources from './pages/AdminResources.jsx';
import Login from './pages/Login.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Register from './pages/Register.jsx';
import ResourceDetail from './pages/ResourceDetail.jsx';
import Resources from './pages/Resources.jsx';
import Triage from './pages/Triage.jsx';

function Shell() {
  const { user, loading, logout, isAdmin } = useAuth();
  if (loading) return <Spinner label="Restoring session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <header className="topbar">
        <strong className="brand">TriageSync</strong>
        <nav className="nav" aria-label="Main">
          <NavLink to="/">Triage</NavLink>
          <NavLink to="/resources">Resources</NavLink>
          <NavLink to="/bookings">My Bookings</NavLink>
          {isAdmin && <NavLink to="/admin/resources">Manage Resources</NavLink>}
          {isAdmin && <NavLink to="/admin/bookings">All Bookings</NavLink>}
          {isAdmin && <NavLink to="/admin/analytics">Analytics</NavLink>}
        </nav>
        <div className="user">
          <span className="user-name">
            {user.name} · {user.role}
          </span>
          <button className="btn btn-small" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Navigate to="/" replace /> : children;
}

const TITLES = {
  '/': 'Triage',
  '/login': 'Log in',
  '/register': 'Register',
  '/resources': 'Resources',
  '/bookings': 'My bookings',
  '/admin/resources': 'Manage resources',
  '/admin/bookings': 'All bookings',
  '/admin/analytics': 'Analytics',
};

function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = TITLES[pathname] ?? (pathname.startsWith('/resources/') ? 'Resource' : null);
    document.title = title ? `${title} · TriageSync` : 'TriageSync';
  }, [pathname]);
}

export default function App() {
  usePageTitle();
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      <Route element={<Shell />}>
        <Route index element={<Triage />} />
        <Route path="resources" element={<Resources />} />
        <Route path="resources/:id" element={<ResourceDetail />} />
        <Route path="bookings" element={<MyBookings />} />
        <Route path="admin/resources" element={<AdminOnly><AdminResources /></AdminOnly>} />
        <Route path="admin/bookings" element={<AdminOnly><AdminBookings /></AdminOnly>} />
        <Route path="admin/analytics" element={<AdminOnly><AdminAnalytics /></AdminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
