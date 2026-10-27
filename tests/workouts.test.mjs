import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function workouts(client = {}) {
  const source = fs.readFileSync(new URL('../src/lib/workouts.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: () => ({ supabase: client }) })
  return exports
}
const ex = { id: 'ex1', nome: 'Supino', grupo: 'Peito', foco: 'Peitoral', instrucoes: 'Executar', equipamento: 'Barra', video_url: null, gif_url: null, series: '3', reps: '10', carga: '20', descanso: '60s' }
const division = { id: 'd1', codigo: 'A', nome: 'Treino A', exercicios: [ex] }
const plan = { id: 'f1', alunoId: 'a1', nome: 'Plano', data: '2026-10-27', divisoes: [division] }
const row = { id: 'f1', aluno_id: 'a1', nome: 'Plano', data: '2026-10-27', template_id: null, divisoes_treino: [
  { id: 'd2', codigo: 'B', nome: 'Treino B', ordem: 1, exercicios_treino: [] },
  { id: 'd1', codigo: 'A', nome: 'Treino A', ordem: 0, exercicios_treino: [{ ...ex, id: 'child2', exercicio_id: null, ordem: 1 }, { ...ex, id: 'child1', exercicio_id: 'ex1', ordem: 0 }] },
] }
test('division codes reuse gaps and continue beyond Z', () => {
  const api = workouts()
  assert.equal(api.makeDivision([], 'new').codigo, 'A')
  assert.equal(api.nextDivisionCode([{ codigo: 'A' }, { codigo: 'C' }]), 'B')
  const alphabet = Array.from({ length: 26 }, (_, i) => ({ codigo: String.fromCharCode(65 + i) }))
  assert.equal(api.nextDivisionCode(alphabet), 'AA')
})
test('editing selected division preserves unsaved data in other divisions and original state', () => {
  const api = workouts()
  const original = [division, { id: 'd2', codigo: 'B', nome: 'Treino B', exercicios: [] }]
  const first = api.updateDivision(original, 'd1', { exercicios: [{ ...ex, carga: '30' }] })
  const second = api.updateDivision(first, 'd2', { exercicios: [{ ...ex, reps: '12' }] })
  assert.equal(second[0].exercicios[0].carga, '30')
  assert.equal(second[1].exercicios[0].reps, '12')
  assert.equal(original[0].exercicios[0].carga, '20')
  assert.throws(() => api.updateDivision(second, 'd2', { codigo: ' a ' }), /único/)
  assert.equal(api.updateDivision(second, 'd2', { codigo: ' c ', nome: 'Novo' })[1].codigo, 'C')
  assert.equal(api.removeDivision(second, 'd1')[0].id, 'd2')
  assert.throws(() => api.removeDivision([division], 'd1'), /pelo menos/)
})
test('loading maps division and exercise order while retaining snapshot fields and null source IDs', async () => {
  const api = workouts({ from: () => ({ select: () => ({ order: async () => ({ data: [row], error: null }) }) }) })
  const [loaded] = await api.loadWorkouts()
  assert.equal(loaded.divisoes[0].codigo, 'A')
  assert.equal(loaded.divisoes[0].exercicios[0].id, 'ex1')
  assert.equal(loaded.divisoes[0].exercicios[1].sourceExerciseId, null)
  assert.equal(loaded.divisoes[0].exercicios[1].carga, '20')
  assert.equal(row.divisoes_treino[0].codigo, 'B')
})
test('save is a single RPC with complete ordered snapshots and stable division IDs', async () => {
  const calls = []
  const api = workouts({ rpc: async (...args) => { calls.push(args); return { data: row, error: null } } })
  const loaded = api.mapPlan(row)
  await api.saveWorkout(loaded, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'pgp_save_workout')
  assert.equal(calls[0][1].p_editing, true)
  assert.equal(calls[0][1].p_divisoes[0].id, 'd1')
  assert.equal(calls[0][1].p_divisoes[0].exercicios[1].exercicio_id, null)
  assert.equal(calls[0][1].p_divisoes[0].exercicios[0].carga, ex.carga)
  assert.equal(calls[0][1].p_divisoes[0].exercicios[0].sourceExerciseId, undefined)
})
test('validation rejects duplicate codes and persistence failures propagate', async () => {
  const error = { code: '42501', message: 'denied' }
  const api = workouts({ rpc: async () => ({ data: null, error }), from: () => ({ select: () => ({ order: async () => ({ data: null, error }) }) }) })
  assert.throws(() => api.validatePlan({ ...plan, divisoes: [division, { ...division, id: 'd2' }] }), /único/)
  assert.throws(() => api.validatePlan({ ...plan, divisoes: [] }), /pelo menos/)
  await assert.rejects(api.saveWorkout(plan, false), value => value === error)
  await assert.rejects(api.loadWorkouts(), value => value === error)
})
test('delete waits for confirmation from the server and rejects denied deletes', async () => {
  let id
  const api = workouts({ from: () => ({ delete: () => ({ eq: (_, value) => { id = value; return { select: () => ({ single: async () => ({ error: { message: 'denied' } }) }) } } }) }) })
  await assert.rejects(api.deleteWorkout('f1'), value => value.message === 'denied')
  assert.equal(id, 'f1')
})
