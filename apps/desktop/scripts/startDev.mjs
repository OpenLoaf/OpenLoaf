#!/usr/bin/env node

import { spawn } from 'node:child_process'

// Linux dev workarounds (no-op on macOS/Windows):
//   --disable-setuid-sandbox: node_modules' chrome-sandbox isn't SUID root on
//     Ubuntu 24.04+, so fall back to the kernel userns sandbox (needs the
//     one-time AppArmor profile in /tmp/install-electron-apparmor.sh).
//   --ozone-platform=x11: Wayland's ozone backend trips on Vulkan and kills
//     the GPU process. Route through Xwayland so rendering is stable.
const passthroughArgs =
  process.platform === 'linux'
    ? ['--', '--disable-setuid-sandbox', '--ozone-platform=x11']
    : []

const child = spawn('electron-forge', ['start', ...passthroughArgs], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

const forward = (sig) => () => {
  try { child.kill(sig) } catch {}
}
process.on('SIGINT', forward('SIGINT'))
process.on('SIGTERM', forward('SIGTERM'))
process.on('SIGHUP', forward('SIGHUP'))

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal === 'SIGINT' ? 0 : 1))
})
