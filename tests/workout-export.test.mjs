import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function module(name, globals = {}) {
  const source = fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: () => ({}), ...globals })
  return exports
}
const ex = i => ({ id: `ex${i}`, nome: `Exercício ${i}`, series: '4', reps: '10–12', carga: '25 kg', descanso: '90s' })
const plan = (divisions = 4, count = 8) => ({ nome: 'Plano ABCD', data: '2026-10-27', divisoes: Array.from({ length: divisions }, (_, i) => ({ codigo: String.fromCharCode(65 + i), nome: `Treino ${i}`, exercicios: Array.from({ length: count }, (_, j) => ex(j)) })) })
const measure = s => s.length * 12
test('PNG has fixed width, compact side-by-side divisions and complete ordered exercise details', () => {
  const api = module('workout-export')
  const pages = api.layoutWorkout(plan(), 'png', measure)
  assert.equal(pages.length, 1)
  assert.equal(api.EXPORT_WIDTH, 1200)
  assert.ok(new Set(pages[0].blocks.map(b => b.x)).size === 2)
  assert.equal(pages[0].blocks.length, 4)
  const first = pages[0].blocks[0]
  assert.equal(first.rows.length, 8)
  assert.match(first.rows[0].lines.join(' '), /4 séries × 10–12 reps.*25 kg.*90s/)
  assert.match(first.rows[7].lines[0], /8\. Exercício 7/)
  for (const block of pages[0].blocks) assert.ok(block.y + block.height < pages[0].height)
})
test('A4 layout paginates long plans without dropping, scaling or splitting ordinary rows', () => {
  const api = module('workout-export')
  const pages = api.layoutWorkout(plan(4, 45), 'pdf', measure)
  assert.ok(pages.length > 4)
  const blocks = pages.flatMap(p => p.blocks)
  assert.equal(blocks.reduce((n, b) => n + b.rows.length, 0), 180)
  for (const page of pages) {
    assert.equal(page.height, 1697)
    for (const b of page.blocks) { assert.ok(b.y >= 210); assert.ok(b.y + b.height <= 1697 - 55) }
  }
  assert.ok(blocks.some(b => b.continued))
})
test('single and empty divisions export; long words and oversized rows retain all text', () => {
  const api = module('workout-export')
  const empty = api.layoutWorkout(plan(1, 0), 'png', measure)
  assert.equal(empty[0].blocks[0].width, 1136)
  assert.equal(empty[0].blocks[0].rows.length, 1)
  const long = plan(1, 1)
  long.divisoes[0].exercicios[0].nome = 'x'.repeat(10000)
  const pages = api.layoutWorkout(long, 'pdf', measure)
  assert.ok(pages.length > 1)
  const text = pages.flatMap(p => p.blocks).flatMap(b => b.rows).flatMap(r => r.lines).join('')
  assert.equal((text.match(/x/g) || []).length, 10000)
  assert.equal(api.wrapText('abcdefgh', 3, s => s.length).join(''), 'abcdefgh')
})
test('mobile share supports missing canShare, cancellation, rejection and unsupported files', async () => {
  const api = module('web-sharing')
  const file = { name: 'ficha.pdf' }
  let calls = 0
  const nav = { share: async () => { calls++ } }
  assert.equal(await api.shareWorkoutFile(file, nav, true), 'shared')
  assert.equal(calls, 1)
  assert.equal(await api.shareWorkoutFile(file, nav, false), 'download')
  assert.equal(calls, 1)
  assert.equal(await api.shareWorkoutFile(file, { ...nav, canShare: () => false }, true), 'download')
  assert.equal(await api.shareWorkoutFile(file, { share: async () => { throw { name: 'AbortError' } } }, true), 'cancelled')
  assert.equal(await api.shareWorkoutFile(file, { share: async () => { throw { name: 'NotAllowedError' } } }, true), 'download')
  assert.equal(await api.shareWorkoutFile(file, {}, true), 'download')
  assert.ok(api.isMobileWeb({ userAgent: 'Macintosh', maxTouchPoints: 5 }))
  assert.ok(!api.isMobileWeb({ userAgent: 'Windows', maxTouchPoints: 0 }))
})
test('download attaches a file link, clicks it and delays URL revocation', () => {
  const calls = [], link = { click: () => calls.push('click'), remove: () => calls.push('remove') }
  let cleanup
  const api = module('web-sharing', {
    document: { createElement: () => link, body: { appendChild: () => calls.push('append') } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => calls.push(url) },
    window: { setTimeout: (fn, delay) => { cleanup = fn; assert.equal(delay, 60000) } },
  })
  api.downloadFile({ name: 'ficha.pdf' })
  assert.equal(link.download, 'ficha.pdf')
  assert.deepEqual(calls, ['append', 'click', 'remove'])
  cleanup(); assert.equal(calls.at(-1), 'blob:test')
})
