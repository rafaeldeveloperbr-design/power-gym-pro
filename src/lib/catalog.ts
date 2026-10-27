import { supabase } from './supabase'

export interface Exercise {
  id: string; nome: string; grupo: string; foco: string; instrucoes: string
  video_url: string | null; gif_url: string | null; equipamento: string
}
export interface TemplateExercise extends Exercise { series: string; reps: string; carga: string; descanso: string }
export interface RemoteTemplate {
  id: string; nome: string; objetivo: string; nivel: string; descricao: string
  dataCriacao: string; exercicios: TemplateExercise[]
}
interface TemplateRow {
  id: string; nome: string; objetivo: string; nivel: string; descricao: string; data_criacao: string
  template_exercicios: (Omit<TemplateExercise, 'id'> & { id: string; exercicio_id: string | null; ordem: number })[]
}
const templateSelect = 'id,nome,objetivo,nivel,descricao,data_criacao,template_exercicios(id,exercicio_id,nome,grupo,foco,instrucoes,video_url,gif_url,equipamento,series,reps,carga,descanso,ordem)'
export function mapTemplate(row: TemplateRow): RemoteTemplate {
  return {
    id: row.id, nome: row.nome, objetivo: row.objetivo, nivel: row.nivel, descricao: row.descricao, dataCriacao: row.data_criacao,
    exercicios: [...row.template_exercicios].sort((a, b) => a.ordem - b.ordem).map(({ id, exercicio_id, ordem: _ordem, ...exercise }) => ({ ...exercise, id: exercicio_id ?? id })),
  }
}
export async function loadCatalog() {
  const [ex, cat, tpl] = await Promise.all([
    supabase.from('biblioteca_exercicios').select('id,nome,grupo,foco,instrucoes,video_url,gif_url,equipamento').order('nome'),
    supabase.from('categorias_exercicios').select('nome').order('nome'),
    supabase.from('templates').select(templateSelect).order('nome'),
  ])
  for (const result of [ex, cat, tpl]) if (result.error) throw result.error
  return { exercises: ex.data as Exercise[], categories: cat.data!.map(c => c.nome as string), templates: (tpl.data as TemplateRow[]).map(mapTemplate) }
}
export async function saveRemoteTemplate(template: RemoteTemplate, editing: boolean) {
  const { data, error } = await supabase.rpc('pgp_save_template', {
    p_template: { id: template.id, nome: template.nome, objetivo: template.objetivo, nivel: template.nivel, descricao: template.descricao, data_criacao: template.dataCriacao },
    p_exercicios: template.exercicios.map(({ id, ...exercise }) => ({ ...exercise, exercicio_id: id })),
    p_editing: editing,
  })
  if (error) throw error
  return mapTemplate(data as TemplateRow)
}
export function remoteError(error: unknown): string {
  const value = error as { code?: string; message?: string }
  if (value?.code === '23505') return 'Já existe um registro com esse nome ou identificador.'
  if (value?.code === '23503') return 'Este registro possui vínculos. Remova os vínculos antes de excluir.'
  if (value?.code === '42501') return 'Sem permissão. Verifique se sua sessão de funcionário está ativa.'
  if (value?.code === 'PGRST202') return 'A função do banco ainda não está disponível. Aplique a migração SQL fornecida.'
  return value?.message || 'Não foi possível concluir a operação. Tente novamente.'
}
