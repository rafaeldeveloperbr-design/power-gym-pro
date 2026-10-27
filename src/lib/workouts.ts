import { supabase } from './supabase'
import type { TemplateExercise } from './catalog'

export interface WorkoutExercise extends TemplateExercise { sourceExerciseId?: string | null }
export interface WorkoutDivision { id: string; codigo: string; nome: string; exercicios: WorkoutExercise[] }
export interface WorkoutPlan { id: string; alunoId: string; nome: string; data: string; templateId?: string; divisoes: WorkoutDivision[] }
interface ExerciseRow extends Omit<TemplateExercise, 'id'> { id: string; exercicio_id: string | null; ordem: number }
interface DivisionRow { id: string; codigo: string; nome: string; ordem: number; exercicios_treino: ExerciseRow[] }
interface PlanRow { id: string; aluno_id: string; nome: string; data: string; template_id: string | null; divisoes_treino: DivisionRow[] }
const selectPlan = 'id,aluno_id,nome,data,template_id,divisoes_treino(id,codigo,nome,ordem,exercicios_treino(id,exercicio_id,nome,grupo,foco,instrucoes,video_url,gif_url,equipamento,series,reps,carga,descanso,ordem))'

export function nextDivisionCode(divisions: WorkoutDivision[]): string {
  const used = new Set(divisions.map(d => d.codigo.trim().toUpperCase()))
  for (let index = 1; ; index++) {
    let code = '', value = index
    while (value > 0) { value--; code = String.fromCharCode(65 + value % 26) + code; value = Math.floor(value / 26) }
    if (!used.has(code)) return code
  }
}
export function makeDivision(divisions: WorkoutDivision[], id = crypto.randomUUID()): WorkoutDivision {
  const codigo = nextDivisionCode(divisions)
  return { id, codigo, nome: `Treino ${codigo}`, exercicios: [] }
}
export function updateDivision(divisions: WorkoutDivision[], id: string, changes: Partial<Pick<WorkoutDivision, 'codigo' | 'nome' | 'exercicios'>>): WorkoutDivision[] {
  const codigo = changes.codigo?.trim().toUpperCase()
  if (codigo !== undefined && (!/^[A-Z]+$/.test(codigo) || divisions.some(d => d.id !== id && d.codigo.toUpperCase() === codigo))) throw new Error('Use um código de letras único por divisão.')
  return divisions.map(d => d.id === id ? { ...d, ...changes, ...(codigo === undefined ? {} : { codigo }) } : d)
}
export function removeDivision(divisions: WorkoutDivision[], id: string): WorkoutDivision[] {
  if (divisions.length <= 1) throw new Error('Mantenha pelo menos uma divisão no plano.')
  return divisions.filter(d => d.id !== id)
}
export function validatePlan(plan: WorkoutPlan) {
  if (!plan.id || !plan.alunoId || !plan.nome.trim() || !plan.divisoes.length) throw new Error('Informe aluno, nome e pelo menos uma divisão.')
  const codes = new Set<string>(), ids = new Set<string>()
  for (const d of plan.divisoes) {
    const code = d.codigo.trim().toUpperCase()
    if (!d.id || ids.has(d.id) || !/^[A-Z]+$/.test(code) || codes.has(code) || !d.nome.trim()) throw new Error('Cada divisão precisa de identificador, código único e nome.')
    codes.add(code); ids.add(d.id)
  }
}
export function mapPlan(row: PlanRow): WorkoutPlan {
  return { id: row.id, alunoId: row.aluno_id, nome: row.nome, data: row.data, templateId: row.template_id ?? undefined,
    divisoes: [...row.divisoes_treino].sort((a, b) => a.ordem - b.ordem).map(d => ({ id: d.id, codigo: d.codigo, nome: d.nome,
      exercicios: [...d.exercicios_treino].sort((a, b) => a.ordem - b.ordem).map(({ id, exercicio_id, ordem: _ordem, ...exercise }) => ({ ...exercise, id: exercicio_id ?? id, sourceExerciseId: exercicio_id })),
    })),
  }
}
export async function loadWorkouts(): Promise<WorkoutPlan[]> {
  const { data, error } = await supabase.from('fichas').select(selectPlan).order('nome')
  if (error) throw error
  return (data as PlanRow[]).map(mapPlan)
}
export async function saveWorkout(plan: WorkoutPlan, editing: boolean): Promise<WorkoutPlan> {
  validatePlan(plan)
  const { data, error } = await supabase.rpc('pgp_save_workout', {
    p_ficha: { id: plan.id, aluno_id: plan.alunoId, nome: plan.nome.trim(), data: plan.data, template_id: plan.templateId ?? null },
    p_divisoes: plan.divisoes.map(d => ({ id: d.id, codigo: d.codigo.trim().toUpperCase(), nome: d.nome.trim(), exercicios: d.exercicios.map(({ id, sourceExerciseId, ...exercise }) => ({ ...exercise, exercicio_id: sourceExerciseId === undefined ? id : sourceExerciseId })) })),
    p_editing: editing,
  })
  if (error?.code === '23505') throw new Error('Este aluno já possui um plano ou há um código de divisão duplicado. Recarregue os planos e edite o existente.')
  if (error) throw error
  return mapPlan(data as PlanRow)
}
export async function deleteWorkout(id: string) {
  const { error } = await supabase.from('fichas').delete().eq('id', id).select('id').single()
  if (error) throw error
}
