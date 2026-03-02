import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './hooks/useAuthStore';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <AppLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

const GuestRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <AppLoader />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
};

const AppLoader = () => (
  <div style={{
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    flexDirection: 'column',
    gap: 16
  }}>
    <div style={{
      width: 48, height: 48,
      background: 'var(--accent)',
      borderRadius: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 24, fontWeight: 800, color: 'white',
      boxShadow: '0 0 30px rgba(79,156,249,0.4)'
    }}>
      Д
    </div>
    <div style={{
      width: 28, height: 28,
      border: '2px solid var(--border-light)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 600ms linear infinite'
    }} />
  </div>
);

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-light)',
            borderRadius: '10px',
            fontSize: '14px',
            fontFamily: 'var(--font-main)'
          },
          success: {
            iconTheme: { primary: '#22c55e', secondary: 'var(--bg-tertiary)' }
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: 'var(--bg-tertiary)' }
          }
        }}
      />

      <Routes>
        <Route path="/login" element={
          <GuestRoute><AuthPage mode="login" /></GuestRoute>
        } />
        <Route path="/register" element={
          <GuestRoute><AuthPage mode="register" /></GuestRoute>
        } />
        <Route path="/" element={
          <ProtectedRoute><ChatPage /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
