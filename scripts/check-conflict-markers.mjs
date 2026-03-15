import { spawnSync } from 'node:child_process'

const conflictPattern = '^(<<<<<<<|=======|>>>>>>>)'
const mode = process.argv.includes('--all') ? 'all' : 'staged'

function runGit(args) {
  return spawnSync('git', args, {
    stdio: 'pipe',
    encoding: 'utf-8',
  })
}

function ensureGitRepo() {
  const result = runGit(['rev-parse', '--is-inside-work-tree'])
  if (result.status !== 0 || result.stdout.trim() !== 'true') {
    console.error('Not a git repository. Skip conflict marker check.')
    process.exit(0)
  }
}

function checkStagedFiles() {
  const result = runGit([
    'diff',
    '--cached',
    '--check',
    '--',
    '.',
    ':(exclude)pnpm-lock.yaml',
    ':(exclude)package-lock.json',
    ':(exclude)yarn.lock',
  ])

  if (result.status !== 0) {
    const output = (result.stdout || result.stderr || '').trim()
    if (output) {
      console.error('Conflict markers detected in staged changes:')
      console.error(output)
    }
    process.exit(1)
  }
}

function checkAllFiles() {
  const result = runGit([
    'grep',
    '-nE',
    conflictPattern,
    '--',
    '.',
    ':(exclude)node_modules/**',
    ':(exclude)build/**',
    ':(exclude)dist/**',
    ':(exclude)pnpm-lock.yaml',
    ':(exclude)package-lock.json',
    ':(exclude)yarn.lock',
  ])

  if (result.status === 0) {
    const output = (result.stdout || '').trim()
    console.error('Conflict markers detected in repository files:')
    console.error(output)
    process.exit(1)
  }

  if (result.status > 1) {
    const output = (result.stderr || result.stdout || '').trim()
    console.error(`Failed to scan repository: ${output}`)
    process.exit(1)
  }
}

function main() {
  ensureGitRepo()

  if (mode === 'all') {
    checkAllFiles()
    return
  }

  checkStagedFiles()
}

main()
