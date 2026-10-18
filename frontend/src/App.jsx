import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Shell from './components/layout/Shell.jsx';
import Login from './pages/Login.jsx';
import CommandCenter from './pages/CommandCenter.jsx';
import Requirements from './pages/Requirements.jsx';
import CandidatePipeline from './pages/CandidatePipeline.jsx';
import Interviews from './pages/Interviews.jsx';
import Employees from './pages/Employees.jsx';
import HrRecords from './pages/HrRecords.jsx';
import Recruiters from './pages/Recruiters.jsx';
import AccountManagers from './pages/AccountManagers.jsx';
import Attendance from './pages/Attendance.jsx';
import Leave from './pages/Leave.jsx';
import MyDashboard from './pages/MyDashboard.jsx';
import Reports from './pages/Reports.jsx';
import BdmActivity from './pages/BdmActivity.jsx';
import CallActivity from './pages/CallActivity.jsx';
import OutlookActivity from './pages/OutlookActivity.jsx';
import Users from './pages/admin/Users.jsx';
import Roles from './pages/admin/Roles.jsx';
import AuditLog from './pages/admin/AuditLog.jsx';
import { AcceptInvite, ResetPassword, ForgotPassword, RequestAccess } from './pages/AuthPages.jsx';
import { can, useSession } from './lib/api.js';
import { NAV } from './lib/nav.js';

const RequireAuth = ({ children }) => (localStorage.getItem('wn_token') ? children : <Navigate to="/login" replace />);

function NoAccess() {
  return (
    <div className="max-w-md mx-auto mt-24 text-center space-y-2">
      <h1 className="text-lg font-bold text-slate-800">No access yet</h1>
      <p className="text-xs text-slate-500">Your account doesn't have permission to any module. Ask an administrator to grant access.</p>
    </div>
  );
}

// Renders the page only if the user can view its module; otherwise sends them to their first allowed page
function Guard({ m, children }) {
  useSession();
  if (can(m)) return children;
  const first = NAV.flatMap(s => s.items).find(i => can(i.module));
  return first && first.to !== '/' ? <Navigate to={first.to} replace /> : <NoAccess />;
}

const PAGES = [
  ['requirements', 'REQUIREMENTS', Requirements],
  ['pipeline', 'PIPELINE', CandidatePipeline],
  ['interviews', 'INTERVIEWS', Interviews],
  ['employees', 'EMPLOYEES', Employees],
  ['hr-records', 'HR_RECORDS', HrRecords],
  ['recruiters', 'RECRUITERS', Recruiters],
  ['account-managers', 'ACCOUNT_MANAGERS', AccountManagers],
  ['attendance', 'ATTENDANCE', Attendance],
  ['leave', 'LEAVE', Leave],
  ['my-dashboard', 'MY_SPACE', MyDashboard],
  ['reports', 'REPORTS', Reports],
  ['bdm-activity', 'CLIENT_ACTIVITY', BdmActivity],
  ['call-activity', 'CALL_ACTIVITY', CallActivity],
  ['outlook-activity', 'OUTLOOK_ACTIVITY', OutlookActivity],
  ['admin/users', 'USER_MANAGEMENT', Users],
  ['admin/roles', 'USER_MANAGEMENT', Roles],
  ['admin/audit', 'AUDIT_LOG', AuditLog]
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/request-access" element={<RequestAccess />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Guard m="COMMAND_CENTER"><CommandCenter /></Guard>} />
        {PAGES.map(([path, m, Page]) => <Route key={path} path={path} element={<Guard m={m}><Page /></Guard>} />)}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
