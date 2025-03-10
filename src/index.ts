import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolveTestPaths } from './resolution.js'

const DEFAULT_TEST_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']

export function getTestExtensions (): string[] {
  if (process.env.TEST_EXTENSIONS != null) {
    return process.env.TEST_EXTENSIONS.split(',').map(e => e.trim())
  }
  return DEFAULT_TEST_EXTENSIONS
}

export interface Options {
  'test-name-pattern'?: string[]
  'test-reporter'?: string[]
  'test-reporter-destination'?: string[]
  'test-only'?: boolean
  watch?: boolean
  'watch-preserve-output'?: boolean
  'experimental-test-coverage'?: boolean
}

export async function main (paths: string[], options: Options): Promise<void> {
  const require = createRequire(import.meta.url)
  const tsnodeRegister = pathToFileURL(require.resolve('ts-node/register')).toString()
  let extensions = getTestExtensions()
  if(paths.length == 1 && paths[0].startsWith('*')) {
    extensions = [paths[0]]
    paths = ["./"]
  }
  const resolvedPaths = await resolveTestPaths(paths, extensions)
  if (resolvedPaths.length === 0) {
    throw new Error('no test files found')
  }

  spawnChild(tsnodeRegister, resolvedPaths, options)
}

/**
 * Execute the Node.js test runner with the given loader and set of test file paths.
 *
 * @param loader The loader to use (fully resolved path to the loader script).
 * @param resolvedTestPaths The files under test.
 * @param options Additional options.
 */
function spawnChild (register: string, resolvedTestPaths: string[], options: Options): void {
  const args = ['--require', register, '--test', ...getOptionFlags(options), ...resolvedTestPaths]
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    argv0: process.argv0
  })
  child.on('error', (error) => {
    console.error(error)
    process.exit(1)
  })
  child.on('exit', (code) => {
    child.removeAllListeners()
    process.off('SIGINT', sendSignalToChild)
    process.off('SIGTERM', sendSignalToChild)
    process.exitCode = code === null ? 1 : code
  })
  process.on('SIGINT', sendSignalToChild)
  process.on('SIGTERM', sendSignalToChild)

  function sendSignalToChild (signal: string): void {
    if (child.pid != null) {
      process.kill(child.pid, signal)
    }
  }
}

function getOptionFlags (options: Options): string[] {
  const flags: string[] = []
  for (const pattern of options['test-name-pattern'] ?? []) {
    flags.push('--test-name-pattern', pattern)
  }
  for (const reporter of options['test-reporter'] ?? []) {
    flags.push('--test-reporter', reporter)
  }
  for (const destination of options['test-reporter-destination'] ?? []) {
    flags.push('--test-reporter-destination', destination)
  }
  if (options['test-only'] === true) {
    flags.push('--test-only')
  }
  if (options.watch === true) {
    flags.push('--watch')
  }
  if (options['watch-preserve-output'] === true) {
    flags.push('--watch-preserve-output')
  }
  if (options['experimental-test-coverage'] === true) {
    flags.push('--experimental-test-coverage')
  }
  return flags
}
