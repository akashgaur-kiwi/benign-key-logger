export const MODULES = [
  'COMMAND_CENTER', 'REQUIREMENTS', 'PIPELINE', 'INTERVIEWS', 'EMPLOYEES', 'HR_RECORDS',
  'RECRUITERS', 'ACCOUNT_MANAGERS', 'ATTENDANCE', 'LEAVE', 'CLIENT_ACTIVITY', 'CALL_ACTIVITY',
  'OUTLOOK_ACTIVITY', 'REPORTS', 'MY_SPACE', 'USER_MANAGEMENT', 'AUDIT_LOG'
];
export const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT', 'APPROVE'];
export const SCOPES = ['OWN', 'TEAM', 'ALL'];
export const SCOPE_RANK = { OWN: 1, TEAM: 2, ALL: 3 };

const all = (m, acts = ACTIONS, scope = 'ALL') => acts.map(action => ({ module: m, action, scope }));
const CRUD = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'];

export const DEFAULT_ROLES = {
  OWNER_ADMIN: {
    description: 'Full access to every module',
    perms: MODULES.flatMap(m => all(m))
  },
  ACCOUNT_MANAGER: {
    description: 'Manages own requirements and team pipeline',
    perms: [
      ...all('COMMAND_CENTER', ['VIEW'], 'TEAM'),
      ...all('REQUIREMENTS', CRUD, 'OWN'),
      ...all('PIPELINE', CRUD, 'TEAM'),
      ...all('INTERVIEWS', CRUD, 'TEAM'),
      ...all('EMPLOYEES', ['VIEW'], 'TEAM'),
      ...all('RECRUITERS', ['VIEW'], 'TEAM'),
      ...all('ACCOUNT_MANAGERS', ['VIEW'], 'ALL'),
      ...all('LEAVE', ['VIEW', 'CREATE', 'APPROVE'], 'TEAM'),
      ...all('CLIENT_ACTIVITY', CRUD, 'TEAM'),
      ...all('CALL_ACTIVITY', ['VIEW', 'CREATE'], 'TEAM'),
      ...all('OUTLOOK_ACTIVITY', ['VIEW', 'CREATE'], 'TEAM'),
      ...all('REPORTS', ['VIEW', 'EXPORT'], 'TEAM'),
      ...all('MY_SPACE', ['VIEW'], 'OWN')
    ]
  },
  RECRUITER: {
    description: 'Works on assigned requirements and own candidates',
    perms: [
      ...all('REQUIREMENTS', ['VIEW'], 'OWN'),
      ...all('PIPELINE', ['VIEW', 'CREATE', 'EDIT'], 'OWN'),
      ...all('INTERVIEWS', ['VIEW', 'CREATE', 'EDIT'], 'OWN'),
      ...all('LEAVE', ['VIEW', 'CREATE'], 'OWN'),
      ...all('CALL_ACTIVITY', ['CREATE'], 'OWN'),
      ...all('OUTLOOK_ACTIVITY', ['CREATE'], 'OWN'),
      ...all('MY_SPACE', ['VIEW'], 'OWN')
    ]
  },
  HR_ADMIN: {
    description: 'People, attendance and user onboarding',
    perms: [
      ...all('COMMAND_CENTER', ['VIEW']),
      ...all('EMPLOYEES', CRUD),
      ...all('HR_RECORDS', CRUD),
      ...all('ATTENDANCE', CRUD),
      ...all('LEAVE', [...CRUD, 'APPROVE']),
      ...all('RECRUITERS', ['VIEW']),
      ...all('CALL_ACTIVITY', ['VIEW']),
      ...all('OUTLOOK_ACTIVITY', ['VIEW']),
      ...all('REPORTS', ['VIEW', 'EXPORT']),
      ...all('MY_SPACE', ['VIEW'], 'OWN'),
      ...all('USER_MANAGEMENT', ['VIEW', 'CREATE', 'EDIT']),
      ...all('AUDIT_LOG', ['VIEW'])
    ]
  }
};
