import 'dotenv/config';
import app from './src/app.js';
import { ensureSystemRoles } from './src/services/access.js';
import { verifyMailer } from './src/services/mailer.js';

const port = process.env.PORT || 4000;
await ensureSystemRoles();
await verifyMailer();
app.listen(port, () => console.log(`API on :${port}`));
