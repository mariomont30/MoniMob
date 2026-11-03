import { createServer } from 'node:http';
import { createRuntime } from './runtime.js';
const port = Number(process.env.PORT || 8787);
createServer(createRuntime()).listen(port, '0.0.0.0', () => console.log('MoniMob API listening on port ' + port));
