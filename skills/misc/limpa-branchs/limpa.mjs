#!/usr/bin/env node
// Inventory and cleanup of merged branches, idle worktrees and their containers on THIS machine.
//
//   node limpa.mjs plano [--raiz <dir>] [--verbose]   read-only: writes the plan JSON and prints a summary
//   node limpa.mjs aplicar <plano.json>                re-checks every item, then deletes only what still qualifies
//
// A branch/worktree is removable only with the three negatives: no open PR, no live worktree/session,
// no commit outside the base branches. Branches whose tip was authored by someone else are kept.
// Docker volumes are never touched. Worktree-only files are archived before removal.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASES = ['main', 'master', 'staging', 'develop', 'production']
const ARQUIVO = path.join(os.homedir(), '.limpa-branchs')

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, ...opts }).trim()
  } catch (e) {
    if (opts.ok) return null
    throw new Error(`${cmd} ${args.join(' ')}: ${(e.stderr || e.message).toString().trim().split('\n')[0]}`)
  }
}
const git = (dir, ...args) => run('git', ['-C', dir, ...args])
const gitOk = (dir, ...args) => run('git', ['-C', dir, ...args], { ok: true })
const tem = (cmd) => run(cmd, ['--version'], { ok: true }) !== null

// ── discovery ────────────────────────────────────────────────────────────────

function reposDe(raiz) {
  const top = gitOk(raiz, 'rev-parse', '--show-toplevel')
  if (top) return [primaria(top)]
  return fs.readdirSync(raiz, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(raiz, d.name))
    .filter((p) => fs.existsSync(path.join(p, '.git')) && fs.statSync(path.join(p, '.git')).isDirectory())
}

function primaria(dir) {
  const first = git(dir, 'worktree', 'list', '--porcelain').split('\n').find((l) => l.startsWith('worktree '))
  return first.slice('worktree '.length)
}

function worktrees(repo) {
  const out = []
  let cur = null
  for (const l of git(repo, 'worktree', 'list', '--porcelain').split('\n')) {
    if (l.startsWith('worktree ')) out.push((cur = { path: l.slice(9), branch: null }))
    else if (l.startsWith('branch refs/heads/')) cur.branch = l.slice(18)
  }
  return out
}

function slugGithub(repo) {
  const url = gitOk(repo, 'remote', 'get-url', 'origin') || ''
  const m = url.match(/[:/]([^/:]+)\/([^/]+?)(\.git)?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

function prsAbertos(repo) {
  const url = gitOk(repo, 'remote', 'get-url', 'origin') || ''
  if (!/github/i.test(url)) return new Set() // remote outside GitHub has no PRs
  const slug = slugGithub(repo)
  if (!slug || !tem('gh')) return null
  const out = run('gh', ['pr', 'list', '--repo', slug, '--state', 'open', '--limit', '300', '--json', 'headRefName', '-q', '.[].headRefName'], { ok: true })
  return out === null ? null : new Set(out.split('\n').filter(Boolean))
}

function sessoesVivas() {
  // Paths with a live process cwd (Linux /proc) or an Orca terminal.
  const caminhos = []
  if (fs.existsSync('/proc')) {
    for (const pid of fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
      try { caminhos.push(fs.readlinkSync(`/proc/${pid}/cwd`)) } catch {}
    }
  }
  if (tem('orca')) {
    const out = run('orca', ['terminal', 'list', '--json'], { ok: true })
    try { for (const t of JSON.parse(out).result.terminals) if (t.worktreePath) caminhos.push(t.worktreePath) } catch {}
  }
  return caminhos
}

function containersEm(wt) {
  if (!tem('docker')) return []
  const ids = run('docker', ['ps', '-aq'], { ok: true })
  if (!ids) return []
  const out = run('docker', ['inspect', '--format', '{{.Id}} {{.Name}} {{range .Mounts}}{{.Source}}|{{end}}', ...ids.split('\n')], { ok: true }) || ''
  return out.split('\n').filter(Boolean).map((l) => {
    const [id, nome, mounts] = l.split(' ')
    return { id: id.slice(0, 12), nome: nome.replace(/^\//, ''), fontes: (mounts || '').split('|').filter(Boolean) }
  }).filter((c) => c.fontes.some((f) => f === wt || f.startsWith(wt + path.sep)))
}

// ── checks ───────────────────────────────────────────────────────────────────

function contexto(repo) {
  gitOk(repo, 'fetch', 'origin', '--prune', '--quiet')
  const remotas = (gitOk(repo, 'for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin') || '').split('\n').filter((b) => b && b !== 'HEAD')
  const padrao = (gitOk(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD') || '').replace(/^origin\//, '')
  const bases = [...new Set([padrao, ...BASES].filter((b) => b && remotas.includes(b)))]
  return {
    repo,
    bases,
    baseRefs: bases.map((b) => `origin/${b}`),
    protegidas: new Set([...BASES, padrao, 'HEAD'].filter(Boolean)),
    eu: [gitOk(repo, 'config', 'user.name'), gitOk(repo, 'config', 'user.email')].filter(Boolean),
    prs: prsAbertos(repo),
    remotas,
  }
}

function foraDaBase(ctx, ref) {
  if (ctx.baseRefs.length === 0) return Infinity
  return Number(gitOk(ctx.repo, 'rev-list', '--count', ref, '--not', ...ctx.baseRefs) ?? Infinity)
}

function autorDaPonta(ctx, ref) {
  return (gitOk(ctx.repo, 'log', '-1', '--format=%an%x00%ae', ref) || '').split('\0')
}

// Returns null when the branch may go, or the reason it stays.
function motivoBranchFica(ctx, nome, ref) {
  if (ctx.protegidas.has(nome)) return 'branch base'
  if (ctx.prs === null) return 'sem checagem de PR (gh indisponível ou sem acesso ao repo)'
  if (ctx.prs.has(nome)) return 'PR aberta'
  const fora = foraDaBase(ctx, ref)
  if (fora > 0) return `${fora} commit(s) fora de ${ctx.bases.join('/') || 'qualquer base'}`
  const [nomeAutor, email] = autorDaPonta(ctx, ref)
  if (!ctx.eu.includes(nomeAutor) && !ctx.eu.includes(email)) return `de outro autor (${nomeAutor})`
  return null
}

function motivoWorktreeFica(ctx, wt, vivas) {
  if (gitOk(wt.path, 'status', '--porcelain', '--untracked-files=no')) return 'edição não commitada'
  if (vivas.some((p) => p === wt.path || p.startsWith(wt.path + path.sep))) return 'sessão ou terminal aberto nela'
  if (!wt.branch) return 'HEAD destacado'
  if (ctx.protegidas.has(wt.branch)) return null // base branch checked out: worktree goes, branch stays
  if (ctx.prs === null) return 'sem checagem de PR'
  if (ctx.prs.has(wt.branch)) return 'PR aberta'
  const fora = foraDaBase(ctx, wt.branch)
  if (fora > 0) return `${fora} commit(s) fora da base`
  return null
}

// Files that exist only in the worktree: untracked (not ignored) plus anything under .scratch/, compared with the primary.
function soDaWorktree(primary, wt) {
  const lista = (gitOk(wt, 'ls-files', '--others', '--exclude-standard') || '').split('\n').filter(Boolean)
  const scratch = path.join(wt, '.scratch')
  if (fs.existsSync(scratch)) {
    for (const f of fs.readdirSync(scratch, { recursive: true, withFileTypes: true })) {
      if (f.isFile()) lista.push(path.relative(wt, path.join(f.parentPath ?? f.path, f.name)))
    }
  }
  return [...new Set(lista)].filter((rel) => {
    const outro = path.join(primary, rel)
    if (!fs.existsSync(outro)) return true
    try { return !fs.readFileSync(outro).equals(fs.readFileSync(path.join(wt, rel))) } catch { return true }
  })
}

// ── plan ─────────────────────────────────────────────────────────────────────

function planejar(raiz) {
  const vivas = sessoesVivas()
  const repos = []
  for (const repo of reposDe(raiz)) {
    const ctx = contexto(repo)
    const wts = worktrees(repo)
    const item = { repo, bases: ctx.bases, worktrees: [], locais: [], remotas: [] }

    const saem = new Set()
    for (const wt of wts.slice(1)) {
      const motivo = motivoWorktreeFica(ctx, wt, vivas)
      if (motivo === null) saem.add(wt.path)
      item.worktrees.push({
        path: wt.path, branch: wt.branch, apaga: motivo === null, motivo,
        arquivar: motivo === null ? soDaWorktree(repo, wt.path) : [],
        containers: motivo === null ? containersEm(wt.path) : [],
      })
    }
    const emUso = new Set(wts.filter((w) => !saem.has(w.path)).map((w) => w.branch).filter(Boolean))

    for (const b of (gitOk(repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads') || '').split('\n').filter(Boolean)) {
      const motivo = ctx.protegidas.has(b) ? 'branch base' : emUso.has(b) ? 'em uso numa worktree que fica' : motivoBranchFica(ctx, b, b)
      item.locais.push({ nome: b, apaga: motivo === null, motivo })
    }
    for (const b of ctx.remotas) {
      const motivo = motivoBranchFica(ctx, b, `origin/${b}`)
      item.remotas.push({ nome: b, apaga: motivo === null, motivo })
    }
    repos.push(item)
  }
  return { criadoEm: new Date().toISOString(), host: os.hostname(), repos }
}

function resumir(plano, verbose) {
  const linhas = []
  for (const r of plano.repos) {
    linhas.push(`## ${path.basename(r.repo)} (base: ${r.bases.join(', ') || 'nenhuma — nada sai'})`)
    for (const [rotulo, lista, nome] of [['Worktrees', r.worktrees, (w) => `${path.basename(w.path)} [${w.branch ?? '—'}]`], ['Branches locais', r.locais, (b) => b.nome], ['Branches no GitHub', r.remotas, (b) => b.nome]]) {
      const sai = lista.filter((x) => x.apaga)
      const fica = lista.filter((x) => !x.apaga && !(x.motivo === 'branch base'))
      linhas.push(`${rotulo}: ${sai.length} saem, ${fica.length} ficam`)
      for (const x of sai) {
        const extra = x.arquivar ? ` · arquiva ${x.arquivar.length} arquivo(s)` + (x.containers.length ? ` · remove container ${x.containers.map((c) => c.nome).join(', ')}` : '') : ''
        linhas.push(`  - SAI ${nome(x)}${extra}`)
      }
      const mostrar = verbose ? fica : fica.slice(0, 15)
      for (const x of mostrar) linhas.push(`  - fica ${nome(x)}: ${x.motivo}`)
      if (mostrar.length < fica.length) linhas.push(`  … mais ${fica.length - mostrar.length} que ficam (--verbose)`)
    }
  }
  return linhas.join('\n')
}

// ── apply ────────────────────────────────────────────────────────────────────

function aplicar(arquivoPlano) {
  const plano = JSON.parse(fs.readFileSync(arquivoPlano, 'utf8'))
  if (plano.host !== os.hostname()) throw new Error(`plano feito em ${plano.host}, esta máquina é ${os.hostname()}`)
  const vivas = sessoesVivas()
  const feito = []
  const pulado = []
  const carimbo = new Date().toISOString().slice(0, 10)

  for (const r of plano.repos) {
    const ctx = contexto(r.repo)
    const atuais = worktrees(r.repo)

    for (const w of r.worktrees.filter((x) => x.apaga)) {
      const wt = atuais.find((a) => a.path === w.path)
      const motivo = wt ? motivoWorktreeFica(ctx, wt, vivas) : 'não existe mais'
      if (motivo !== null) { pulado.push(`worktree ${path.basename(w.path)}: ${motivo}`); continue }
      const arquivos = soDaWorktree(r.repo, w.path)
      if (arquivos.length) {
        const dest = path.join(ARQUIVO, path.basename(r.repo), `${path.basename(w.path)}-${carimbo}`)
        for (const rel of arquivos) {
          fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true })
          fs.copyFileSync(path.join(w.path, rel), path.join(dest, rel))
        }
        feito.push(`arquivou ${arquivos.length} arquivo(s) de ${path.basename(w.path)} em ${dest}`)
      }
      for (const c of containersEm(w.path)) {
        run('docker', ['rm', '-f', c.id]) // container only; volumes are never removed
        feito.push(`removeu container ${c.nome}`)
      }
      const viaOrca = tem('orca') && run('orca', ['worktree', 'rm', '--worktree', `path:${w.path}`, '--json'], { ok: true })
      if (!viaOrca || fs.existsSync(w.path)) git(r.repo, 'worktree', 'remove', '--force', w.path)
      feito.push(`removeu worktree ${path.basename(w.path)}`)
    }
    gitOk(r.repo, 'worktree', 'prune')

    const emUso = new Set(worktrees(r.repo).map((w) => w.branch).filter(Boolean))
    for (const b of r.locais.filter((x) => x.apaga)) {
      const motivo = emUso.has(b.nome) ? 'em uso numa worktree' : gitOk(r.repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${b.nome}`) === null ? 'não existe mais' : motivoBranchFica(ctx, b.nome, b.nome)
      if (motivo !== null) { pulado.push(`local ${b.nome}: ${motivo}`); continue }
      git(r.repo, 'branch', '-D', b.nome)
      feito.push(`apagou branch local ${b.nome}`)
    }
    const remotas = r.remotas.filter((x) => x.apaga).filter((b) => {
      const motivo = ctx.remotas.includes(b.nome) ? motivoBranchFica(ctx, b.nome, `origin/${b.nome}`) : 'não existe mais'
      if (motivo !== null) pulado.push(`GitHub ${b.nome}: ${motivo}`)
      return motivo === null
    })
    if (remotas.length) {
      git(r.repo, 'push', 'origin', '--delete', ...remotas.map((b) => b.nome))
      feito.push(`apagou ${remotas.length} branch(es) no GitHub: ${remotas.map((b) => b.nome).join(', ')}`)
    }
  }
  console.log(['Feito:', ...feito.map((l) => `  - ${l}`), pulado.length ? 'Pulado na rechecagem:' : '', ...pulado.map((l) => `  - ${l}`)].filter(Boolean).join('\n'))
}

// ── cli ──────────────────────────────────────────────────────────────────────

const [modo, ...resto] = process.argv.slice(2)
const opt = (n) => { const i = resto.indexOf(n); return i >= 0 ? resto[i + 1] : null }
if (modo === 'plano') {
  const raiz = opt('--raiz') || process.cwd()
  const plano = planejar(raiz)
  fs.mkdirSync(ARQUIVO, { recursive: true })
  const destino = path.join(ARQUIVO, `plano-${Date.now()}.json`)
  fs.writeFileSync(destino, JSON.stringify(plano, null, 2))
  console.log(resumir(plano, resto.includes('--verbose')))
  console.log(`\nPlano: ${destino}`)
} else if (modo === 'aplicar' && resto[0]) {
  aplicar(resto[0])
} else {
  console.error('uso: limpa.mjs plano [--raiz <dir>] [--verbose] | limpa.mjs aplicar <plano.json>')
  process.exit(2)
}
