import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3006;

app.use(cors());
app.use(express.json());

let devProcess = null;

app.get('/status', (req, res) => {
  res.json({ running: devProcess !== null });
});

app.post('/start', (req, res) => {
  if (devProcess) {
    return res.json({ success: true, message: 'Already running' });
  }

  console.log('🚀 Starting dev server...');
  
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  
  // Use npm run dev
  devProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: __dirname,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` }
  });

  devProcess.on('exit', () => {
    console.log('🛑 Dev server stopped');
    devProcess = null;
  });

  res.json({ success: true });
});

app.post('/stop', (req, res) => {
  if (!devProcess) {
    return res.json({ success: true, message: 'Not running' });
  }

  console.log('🛑 Stopping dev server...');
  
  // On Windows/Mac/Linux, killing the parent shell might not kill the child
  // But for simple 'npm run dev' on Mac, it usually works if we handle it properly.
  // We'll use a more robust kill if needed, but let's start simple.
  devProcess.kill('SIGINT');
  devProcess = null;
  
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`📡 Server Manager Bridge running on http://localhost:${PORT}`);
});
