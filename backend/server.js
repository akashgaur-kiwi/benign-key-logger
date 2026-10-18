import 'dotenv/config';
import app from './src/app.js';
import { ensureSystemRoles } from './src/services/access.js';

const port = process.env.PORT || 4000;
await ensureSystemRoles();
app.listen(port, () => console.log(`API on :${port}`));
