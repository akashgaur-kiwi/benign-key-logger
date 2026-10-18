import { Router } from 'express';
import { auth, agentKey } from '../middlewares/auth.middleware.js';
import { can } from '../middlewares/role.middleware.js';
import { login, me, register, checkToken, acceptInvite, forgotPassword, resetPassword, changePassword } from '../controllers/auth.controller.js';
import { getCommandCenterData } from '../controllers/commandCenter.controller.js';
import { listRequirements, createRequirement, updateRequirement, assignRecruiters, getAccountManagers } from '../controllers/requirements.controller.js';
import { listSubmissions, createSubmission, moveStage, listInterviews, createInterview, updateInterview } from '../controllers/pipeline.controller.js';
import { callSummary, logCall, emailSummary, logEmail } from '../controllers/calling.controller.js';
import { listEmployees, attendanceSummary, upsertAttendance, clockAttendance, recruiterLeaderboard } from '../controllers/hr.controller.js';
import { listLeaves, createLeave, decideLeave, cancelLeave, leaveBalance } from '../controllers/leave.controller.js';
import { logClientInteraction, bdmSummary } from '../controllers/clientActivity.controller.js';
import { attendanceReport, employeeReport } from '../controllers/reports.controller.js';
import { myDashboard } from '../controllers/myspace.controller.js';
import { listNotifications, markRead, markAllRead, broadcast } from '../controllers/notifications.controller.js';
import { logAppEvent } from '../controllers/agent.controller.js';
import {
  listUsers, getUser, inviteUser, resendInvite, updateUser, changeStatus,
  forceLogout, unlockUser, adminResetLink, setUserPermissions
} from '../controllers/users.controller.js';
import { catalog, listRoles, createRole, updateRole, deleteRole } from '../controllers/roles.controller.js';
import { listAudit } from '../controllers/audit.controller.js';

const r = Router();
const UM = 'USER_MANAGEMENT';

r.post('/auth/login', login);
r.post('/auth/register', register);
r.get('/auth/check-token', checkToken);
r.post('/auth/accept-invite', acceptInvite);
r.post('/auth/forgot-password', forgotPassword);
r.post('/auth/reset-password', resetPassword);
r.post('/agent/events', agentKey, logAppEvent);

r.use(auth);
r.get('/auth/me', me);
r.post('/auth/change-password', changePassword);

r.get('/command-center', can('COMMAND_CENTER', 'VIEW'), getCommandCenterData);

r.get('/requirements', can('REQUIREMENTS', 'VIEW'), listRequirements);
r.post('/requirements', can('REQUIREMENTS', 'CREATE'), createRequirement);
r.patch('/requirements/:id', can('REQUIREMENTS', 'EDIT'), updateRequirement);
r.post('/requirements/:id/assign', can('REQUIREMENTS', 'EDIT'), assignRecruiters);
r.get('/account-managers', can('ACCOUNT_MANAGERS', 'VIEW'), getAccountManagers);

r.get('/pipeline', can('PIPELINE', 'VIEW'), listSubmissions);
r.post('/pipeline', can('PIPELINE', 'CREATE'), createSubmission);
r.patch('/pipeline/:id/stage', can('PIPELINE', 'EDIT'), moveStage);

r.get('/interviews', can('INTERVIEWS', 'VIEW'), listInterviews);
r.post('/interviews', can('INTERVIEWS', 'CREATE'), createInterview);
r.patch('/interviews/:id', can('INTERVIEWS', 'EDIT'), updateInterview);

r.get('/calls/summary', can('CALL_ACTIVITY', 'VIEW'), callSummary);
r.post('/calls', can('CALL_ACTIVITY', 'CREATE'), logCall);
r.get('/emails/summary', can('OUTLOOK_ACTIVITY', 'VIEW'), emailSummary);
r.post('/emails', can('OUTLOOK_ACTIVITY', 'CREATE'), logEmail);

r.get('/employees', can('EMPLOYEES', 'VIEW'), listEmployees);
r.get('/recruiters', can('RECRUITERS', 'VIEW'), recruiterLeaderboard);
r.get('/attendance', can('ATTENDANCE', 'VIEW'), attendanceSummary);
r.put('/attendance', can('ATTENDANCE', 'EDIT'), upsertAttendance);

r.get('/leaves', can('LEAVE', 'VIEW'), listLeaves);
r.get('/leaves/balance', can('LEAVE', 'VIEW'), leaveBalance);
r.post('/leaves', can('LEAVE', 'CREATE'), createLeave);
r.post('/leaves/:id/decide', can('LEAVE', 'APPROVE'), decideLeave);
r.post('/leaves/:id/cancel', can('LEAVE', 'VIEW'), cancelLeave);

r.put('/attendance/clock', can('ATTENDANCE', 'EDIT'), clockAttendance);

r.get('/client-activity', can('CLIENT_ACTIVITY', 'VIEW'), bdmSummary);
r.post('/client-activity', can('CLIENT_ACTIVITY', 'CREATE'), logClientInteraction);

r.get('/reports/attendance', can('REPORTS', 'VIEW'), attendanceReport);
r.get('/reports/employees', can('REPORTS', 'VIEW'), employeeReport);

r.get('/me/dashboard', can('MY_SPACE', 'VIEW'), myDashboard);

r.get('/notifications', listNotifications);
r.post('/notifications/read-all', markAllRead);
r.post('/notifications/:id/read', markRead);
r.post('/notifications/broadcast', can('USER_MANAGEMENT', 'CREATE'), broadcast);

r.get('/access/catalog', can(UM, 'VIEW'), catalog);
r.get('/roles', can(UM, 'VIEW'), listRoles);
r.post('/roles', can(UM, 'APPROVE'), createRole);
r.patch('/roles/:id', can(UM, 'APPROVE'), updateRole);
r.delete('/roles/:id', can(UM, 'APPROVE'), deleteRole);

r.get('/users', can(UM, 'VIEW'), listUsers);
r.post('/users/invite', can(UM, 'CREATE'), inviteUser);
r.get('/users/:id', can(UM, 'VIEW'), getUser);
r.patch('/users/:id', can(UM, 'EDIT'), updateUser);
r.post('/users/:id/resend-invite', can(UM, 'CREATE'), resendInvite);
r.post('/users/:id/approve', can(UM, 'APPROVE'), changeStatus('approve'));
r.post('/users/:id/reject', can(UM, 'APPROVE'), changeStatus('reject'));
r.post('/users/:id/suspend', can(UM, 'EDIT'), changeStatus('suspend'));
r.post('/users/:id/restore', can(UM, 'EDIT'), changeStatus('restore'));
r.post('/users/:id/revoke', can(UM, 'EDIT'), changeStatus('revoke'));
r.post('/users/:id/reactivate', can(UM, 'APPROVE'), changeStatus('reactivate'));
r.post('/users/:id/force-logout', can(UM, 'EDIT'), forceLogout);
r.post('/users/:id/unlock', can(UM, 'EDIT'), unlockUser);
r.post('/users/:id/reset-link', can(UM, 'EDIT'), adminResetLink);
r.put('/users/:id/permissions', can(UM, 'EDIT'), setUserPermissions);

r.get('/audit-logs', can('AUDIT_LOG', 'VIEW'), listAudit);

export default r;
