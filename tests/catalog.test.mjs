import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function catalog(client) {
  const source = fs.readFileSync(new URL('../src/lib/catalog.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: () => ({ supabase: client }) })
  return exports
}
const exercise = { id: 'ex1', nome: 'Supino', grupo: 'Peito', foco: 'Peitoral', instrucoes: 'Executar', equipamento: 'Barra', video_url: null, gif_url: 'https://example.com/ex.gif', series: '3', reps: '10-12', carga: '20', descanso: '60s' }
const row = { id: 't1', nome: 'Treino', objetivo: 'HIPERTROFIA', nivel: 'INICIANTE', descricao: 'Teste', data_criacao: '2026-10-27', template_exercicios: [
  { ...exercise, id: 'child2', exercicio_id: 'ex2', ordem: 1 },
  { ...exercise, id: 'child1', exercicio_id: exercise.id, ordem: 0 },
] }

test('loads remote collections and restores child order and original exercise IDs', async () => {
  const responses = { biblioteca_exercicios: [exercise], categorias_exercicios: [{ nome: 'Peito' }], templates: [row] }
  const api = catalog({ from: name => ({ select: () => ({ order: async () => ({ data: responses[name], error: null }) }) }) })
  const data = await api.loadCatalog()
  assert.equal(data.exercises[0].id, 'ex1')
  assert.equal(data.categories[0], 'Peito')
  assert.equal(data.templates[0].exercicios[0].id, 'ex1')
  assert.equal(data.templates[0].exercicios[1].id, 'ex2')
  assert.equal(data.templates[0].exercicios[0].carga, '20')
  assert.equal(row.template_exercicios[0].ordem, 1)
})
test('load fails as a whole when any remote collection fails', async () => {
  const error = { code: '42501', message: 'denied' }
  const api = catalog({ from: name => ({ select: () => ({ order: async () => ({ data: [], error: name === 'templates' ? error : null }) }) }) })
  await assert.rejects(api.loadCatalog(), value => value === error)
})
test('save uses one RPC and preserves every exercise field, including snapshot data', async () => {
  const calls = []
  const api = catalog({ rpc: async (...args) => { calls.push(args); return { data: row, error: null } } })
  const template = { id: 't1', nome: 'Treino', objetivo: 'HIPERTROFIA', nivel: 'INICIANTE', descricao: 'Teste', dataCriacao: '2026-10-27', exercicios: [exercise] }
  const saved = await api.saveRemoteTemplate(template, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'pgp_save_template')
  const payload = calls[0][1]
  assert.equal(payload.p_editing, true)
  const { id, ...fields } = exercise
  assert.equal(JSON.stringify(payload.p_exercicios[0]), JSON.stringify({ ...fields, exercicio_id: id }))
  assert.equal(saved.exercicios[0].gif_url, exercise.gif_url)
})
test('RPC failures are propagated without reporting success', async () => {
  const error = { code: '23514', message: 'child rejected' }
  const api = catalog({ rpc: async () => ({ data: null, error }) })
  await assert.rejects(api.saveRemoteTemplate({ exercicios: [exercise] }, false), value => value === error)
})
