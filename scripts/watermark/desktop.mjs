import { spawn } from 'node:child_process'
import process from 'node:process'

/** Use the documented local-chat deep link; never modify the desktop's database. */
export function openCodexThread(threadId) {
  if (typeof threadId !== 'string' || !/^[a-f0-9-]{36}$/i.test(threadId))
    return Promise.reject(new Error('Invalid Codex thread ID'))
  if (process.platform !== 'darwin')
    return Promise.reject(new Error('Automatic desktop opening is currently available on macOS only'))
  return new Promise((resolve, reject) => {
    const child = spawn('open', [`codex://threads/${threadId}`], { stdio: 'ignore', shell: false })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Desktop open timed out'))
    }, 5000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0)
        resolve()
      else
        reject(new Error('Could not open Codex desktop'))
    })
  })
}
