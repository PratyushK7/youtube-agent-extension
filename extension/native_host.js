#!/opt/homebrew/bin/node

/**
 * ChannelLens Native Messaging Host
 * 
 * IMPORTANT: This script MUST NOT print anything to STDOUT except via sendMessage().
 * Any console.log() or error msg on STDOUT will crash the connection.
 * We use a dedicated log file for debugging.
 */

import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const logFile = path.join(rootDir, 'native_host.log');

function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
}

log('--- Native Host Started ---');

// --- Protocol Handling ---
let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  handleInput();
});

function handleInput() {
  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readInt32LE(0);
    if (inputBuffer.length < 4 + msgLen) break;
    
    const msgData = inputBuffer.slice(4, 4 + msgLen);
    inputBuffer = inputBuffer.slice(4 + msgLen);
    
    try {
      const msg = JSON.parse(msgData.toString());
      log(`Received: ${JSON.stringify(msg)}`);
      dispatch(msg);
    } catch (e) {
      log(`Error parsing message: ${e.message}`);
    }
  }
}

function sendMessage(msg) {
  try {
    const msgString = JSON.stringify(msg);
    const msgLen = Buffer.byteLength(msgString);
    const header = Buffer.alloc(4);
    header.writeInt32LE(msgLen, 0);
    
    process.stdout.write(header);
    process.stdout.write(msgString);
    log(`Sent: ${msgString}`);
  } catch (e) {
    log(`Error sending message: ${e.message}`);
  }
}

// --- Logic Dispatch ---
let devProcess = null;

function dispatch(msg) {
  if (msg.action === 'START') startServer();
  if (msg.action === 'STOP') stopServer();
  if (msg.action === 'STATUS') getStatus();
}

function startServer() {
  if (devProcess) {
    sendMessage({ status: 'running', message: 'Already running' });
    return;
  }

  log('Spawning dev server...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  
  // stdio: ['ignore', 'ignore', 'pipe'] means:
  // stdin: ignore
  // stdout: ignore (CRITICAL: don't let child logs leak to our stdout)
  // stderr: pipe (we can log child errors to our log file)
  devProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: rootDir,
    shell: true,
    stdio: ['ignore', 'ignore', 'pipe'], 
    env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` }
  });

  devProcess.stderr.on('data', (data) => {
    log(`[NPM ERROR] ${data.toString()}`);
  });

  devProcess.on('exit', (code) => {
    log(`Dev server exited with code ${code}`);
    devProcess = null;
    sendMessage({ status: 'stopped' });
  });

  sendMessage({ status: 'running' });
}

function stopServer() {
  if (devProcess) {
    log('Killing dev server...');
    devProcess.kill('SIGINT');
    devProcess = null;
  }
  sendMessage({ status: 'stopped' });
}

function getStatus() {
  sendMessage({ status: devProcess ? 'running' : 'stopped' });
}

// --- Error Handling ---
process.on('uncaughtException', (err) => {
  log(`Uncaught Exception: ${err.message}\n${err.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection: ${reason}`);
});
