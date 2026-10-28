import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, ToastProvider, useAuth, Loading } from './lib.jsx';
import Layout from './components/Layout.jsx';
import { Login, Signup } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Senders from './pages/Senders.jsx';
import Contacts from './pages/Contacts.jsx';
import Templates, { TemplateEditor } from './pages/Templates.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CampaignEditor from './pages/CampaignEditor.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Suppressions from './pages/Suppressions.jsx';
import Settings from './pages/Settings.jsx';

function Gate({ children, guest }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (guest) return user ? <Navigate to="/" replace /> : children;
  return user ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Gate guest><Login /></Gate>} />
      <Route path="/signup" element={<Gate guest><Signup /></Gate>} />
      <Route element={<Gate><Layout /></Gate>}>
        <Route index element={<Dashboard />} />
        <Route path="senders" element={<Senders />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="templates" element={<Templates />} />
        <Route path="templates/:id" element={<TemplateEditor />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/new" element={<CampaignEditor />} />
        <Route path="campaigns/:id/edit" element={<CampaignEditor />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="suppressions" element={<Suppressions />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
