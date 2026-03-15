import { spawnSync } from 'node:child_process'

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    stdio: 'pipe',
    encoding: 'utf-8',
    ...options,
  })
  return result
}

function runGitOrThrow(args, label) {
  const result = runGit(args)
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    throw new Error(`${label} failed: ${message}`)
  }
  return result
}

function runGuardOrThrow() {
  const result = spawnSync('node', ['scripts/check-conflict-markers.mjs'], {
    stdio: 'pipe',
    encoding: 'utf-8',
  })

  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    throw new Error(`check conflicts failed: ${message}`)
  }
}

function ensureGitRepo() {
  const result = runGit(['rev-parse', '--is-inside-work-tree'])
  if (result.status !== 0 || result.stdout.trim() !== 'true') {
    throw new Error('Folder ini belum jadi Git repository. Jalankan: git init')
  }
}

function ensureOriginRemote() {
  const result = runGit(['remote', 'get-url', 'origin'])
  if (result.status !== 0) {
    throw new Error(
      'Remote origin belum diset. Jalankan: git remote add origin <url>',
    )
  }
}

function getCurrentBranch() {
  const result = runGitOrThrow(
    ['branch', '--show-current'],
    'get current branch',
  )
  const branch = result.stdout.trim()
  if (!branch) {
    throw new Error('Branch aktif tidak terdeteksi.')
  }
  return branch
}

function hasStagedChanges() {
  const result = runGit(['diff', '--cached', '--quiet'])
  return result.status !== 0
}

function main() {
  try {
    ensureGitRepo()
    ensureOriginRemote()

    const branch = getCurrentBranch()

    runGitOrThrow(['add', '-A'], 'git add')
    runGuardOrThrow()

    if (hasStagedChanges()) {
      const message = process.env.GIT_COMMIT_MESSAGE || 'Update project'
      runGitOrThrow(['commit', '-m', message], 'git commit')
      console.log(`Committed with message: "${message}"`)
    } else {
      console.log('No staged changes. Skip commit.')
    }

    runGitOrThrow(['pull', 'origin', 'main', '--no-rebase'], 'git pull')
    runGitOrThrow(['push', 'origin', branch], 'git push')

    console.log(`git:team completed successfully on branch: ${branch}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
