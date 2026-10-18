export const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Forbidden' });

// Requires MODULE:ACTION; sets req.scope (OWN | TEAM | ALL) for controllers
export const can = (module, action = 'VIEW') => (req, res, next) => {
  const scope = req.user?.perms?.[`${module}:${action}`];
  if (!scope) return res.status(403).json({ error: `Missing permission ${module}:${action}` });
  req.scope = scope;
  next();
};
