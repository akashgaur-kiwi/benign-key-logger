import {
  LayoutDashboard, Briefcase, GitBranch, Calendar, Users, FileText, UserCheck,
  BriefcaseBusiness, Clock, CalendarCheck, PhoneCall, Mail, UserCog, ShieldCheck, ScrollText,
  LayoutPanelLeft, BarChart3, Handshake
} from 'lucide-react';

// Single source for sidebar, route guards and landing page
export const NAV = [
  { section: 'Overview', items: [
    { to: '/', module: 'COMMAND_CENTER', icon: LayoutDashboard, label: 'Command Center' },
    { to: '/my-dashboard', module: 'MY_SPACE', icon: LayoutPanelLeft, label: 'My Dashboard' }
  ] },
  { section: 'Work Management', items: [
    { to: '/requirements', module: 'REQUIREMENTS', icon: Briefcase, label: 'Requirements' },
    { to: '/pipeline', module: 'PIPELINE', icon: GitBranch, label: 'Candidate Pipeline' },
    { to: '/interviews', module: 'INTERVIEWS', icon: Calendar, label: 'Interviews' }
  ] },
  { section: 'People', items: [
    { to: '/employees', module: 'EMPLOYEES', icon: Users, label: 'Employees' },
    { to: '/hr-records', module: 'HR_RECORDS', icon: FileText, label: 'HR Records & Documents' },
    { to: '/recruiters', module: 'RECRUITERS', icon: UserCheck, label: 'Recruiters' },
    { to: '/account-managers', module: 'ACCOUNT_MANAGERS', icon: BriefcaseBusiness, label: 'Account Managers' },
    { to: '/attendance', module: 'ATTENDANCE', icon: Clock, label: 'HR & Attendance' },
    { to: '/leave', module: 'LEAVE', icon: CalendarCheck, label: 'Leave Management' }
  ] },
  { section: 'Productivity', items: [
    { to: '/bdm-activity', module: 'CLIENT_ACTIVITY', icon: Handshake, label: 'BDM Performance' },
    { to: '/call-activity', module: 'CALL_ACTIVITY', icon: PhoneCall, label: 'Call Activity' },
    { to: '/outlook-activity', module: 'OUTLOOK_ACTIVITY', icon: Mail, label: 'Outlook Activity' },
    { to: '/reports', module: 'REPORTS', icon: BarChart3, label: 'Reports' }
  ] },
  { section: 'Administration', items: [
    { to: '/admin/users', module: 'USER_MANAGEMENT', icon: UserCog, label: 'Users & Access' },
    { to: '/admin/roles', module: 'USER_MANAGEMENT', icon: ShieldCheck, label: 'Roles & Permissions' },
    { to: '/admin/audit', module: 'AUDIT_LOG', icon: ScrollText, label: 'Audit Log' }
  ] }
];

export const MODULE_LABEL = Object.fromEntries(NAV.flatMap(s => s.items).map(i => [i.module, i.label]));
MODULE_LABEL.USER_MANAGEMENT = 'User Management';
MODULE_LABEL.COMMAND_CENTER = 'Command Center';
