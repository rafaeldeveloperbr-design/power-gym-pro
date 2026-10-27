import { jsPDF } from 'jspdf'
import type { WorkoutPlan } from './workouts'

export interface ExportStudent { nome: string; objetivo: string; peso: string; altura: string }
type Measure = (text: string) => number
export function wrapText(text: string, width: number, measure: Measure): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && measure(`${line} ${word}`) <= width) { line += ` ${word}`; continue }
    if (line) { lines.push(line); line = '' }
    for (const char of word) {
      if (line && measure(line + char) > width) { lines.push(line); line = '' }
      line += char
    }
  }
  if (line || !lines.length) lines.push(line)
  return lines
}
interface Row { lines: string[]; height: number }
interface Section { title: string[]; rows: Row[] }
export interface ExportBlock { section: Section; rows: Row[]; x: number; y: number; width: number; height: number; continued: boolean }
export interface ExportPage { blocks: ExportBlock[]; height: number }
export const EXPORT_WIDTH = 1200
const TOP = 210, BOTTOM = 55, GAP = 24
const font = (size: number, bold = false) => `${bold ? 700 : 400} ${size}px "Inter Variable", sans-serif`
export function layoutWorkout(plan: WorkoutPlan, format: 'png' | 'pdf', measure: Measure): ExportPage[] {
  const columns = format === 'png' && plan.divisoes.length > 1 ? 2 : 1
  const width = (EXPORT_WIDTH - 64 - GAP * (columns - 1)) / columns
  const sections: Section[] = plan.divisoes.map(d => ({
    title: wrapText(`${d.codigo} — ${d.nome}`, width - 32, measure),
    rows: d.exercicios.length ? d.exercicios.map((e, i) => {
      const lines = [...wrapText(`${i + 1}. ${e.nome}`, width - 32, measure),
        ...wrapText(`${e.series || '—'} séries × ${e.reps || '—'} reps   |   Carga: ${e.carga || '—'}   |   Descanso: ${e.descanso || '—'}`, width - 32, measure)]
      return { lines, height: lines.length * 27 + 22 }
    }) : [{ lines: ['Nenhum exercício nesta divisão.'], height: 54 }],
  }))
  if (sections.some(s => s.title.length > 12)) throw new Error('Nome de divisão muito longo para exportar. Reduza o nome e tente novamente.')
  const pages: ExportPage[] = [{ blocks: [], height: format === 'pdf' ? 1697 : TOP + BOTTOM }]
  const positions = Array(columns).fill(TOP) as number[]
  for (const section of sections) {
    const column = positions.indexOf(Math.min(...positions))
    const headerHeight = section.title.length * 28 + 24
    let continued = false, pending: Row[] = []
    const flush = () => {
      if (!pending.length) return
      const height = headerHeight + pending.reduce((n, r) => n + r.height, 0)
      pages[pages.length - 1].blocks.push({ section, rows: pending, x: 32 + column * (width + GAP), y: positions[column], width, height, continued })
      positions[column] += height + GAP; pending = []; continued = true
    }
    for (const row of section.rows) {
      // A pathological long row is split by text lines, keeping every value.
      const maxLines = Math.floor((1697 - TOP - BOTTOM - headerHeight - 22) / 27)
      const chunks = format === 'pdf' ? Array.from({ length: Math.ceil(row.lines.length / maxLines) }, (_, i) => row.lines.slice(i * maxLines, (i + 1) * maxLines)) : [row.lines]
      for (const lines of chunks) {
        const item = { lines, height: lines.length * 27 + 22 }
        const used = pending.reduce((n, r) => n + r.height, 0)
        if (format === 'pdf' && positions[column] + headerHeight + used + item.height > 1697 - BOTTOM) {
          flush(); pages.push({ blocks: [], height: 1697 }); positions.fill(TOP)
        }
        pending.push(item)
      }
    }
    flush()
  }
  if (format === 'png') pages[0].height = Math.max(...positions) + BOTTOM
  return pages
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 20, bold = false, color = '#111') {
  ctx.font = font(size, bold); ctx.fillStyle = color; ctx.fillText(value, x, y)
}
function renderPage(page: ExportPage, plan: WorkoutPlan, student: ExportStudent | undefined, index: number, total: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_WIDTH; canvas.height = page.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível.')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, canvas.width, 86)
  text(ctx, '"POWER', 32, 43, 32, true, '#fff')
  text(ctx, '—  G Y M   P R O  —', 32, 68, 15, false, '#fff')
  text(ctx, plan.data, 930, 50, 19, false, '#ccc')
  const measure = (value: string) => { ctx.font = font(23, true); return ctx.measureText(value).width }
  // Header text is bounded without depending on the browser viewport.
  const fit = (value: string, limit: number) => {
    if (measure(value) <= limit) return value
    while (value && measure(value + '…') > limit) value = value.slice(0, -1)
    return value + '…'
  }
  text(ctx, fit(student?.nome ?? 'Aluno', 1120), 32, 126, 26, true)
  text(ctx, fit(plan.nome, 1120), 32, 161, 23, true)
  text(ctx, [student?.objetivo, student?.peso && `${student.peso} kg`, student?.altura && `${student.altura} cm`].filter(Boolean).join(' • '), 32, 190, 18, false, '#555')
  for (const block of page.blocks) {
    let y = block.y
    const headerHeight = block.section.title.length * 28 + 24
    ctx.fillStyle = '#111'; ctx.fillRect(block.x, y, block.width, headerHeight)
    block.section.title.forEach((line, i) => text(ctx, line, block.x + 16, y + 33 + i * 28, 21, true, '#fff'))
    y += headerHeight
    block.rows.forEach((row, i) => {
      ctx.fillStyle = i % 2 ? '#fff' : '#f3f3f3'; ctx.fillRect(block.x, y, block.width, row.height)
      row.lines.forEach((line, n) => text(ctx, line, block.x + 16, y + 28 + n * 27, 20, n === 0))
      y += row.height
    })
  }
  text(ctx, `TREINO PROFISSIONAL. RESULTADOS REAIS.  •  ${index + 1}/${total}`, 32, page.height - 22, 15, false, '#777')
  return canvas
}
export async function createWorkoutFile(plan: WorkoutPlan, student: ExportStudent | undefined, format: 'png' | 'pdf'): Promise<File> {
  await document.fonts.ready
  await document.fonts.load(font(20))
  await document.fonts.load(font(21, true))
  const measureCanvas = document.createElement('canvas'), ctx = measureCanvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível.')
  ctx.font = font(21, true)
  const pages = layoutWorkout(plan, format, value => ctx.measureText(value).width)
  const name = `ficha-${plan.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'treino'}.${format}`
  if (format === 'png') {
    // Avoid silently producing a truncated/blank image beyond common canvas limits.
    if (pages[0].height > 16000) throw new Error('Plano muito longo para uma imagem. Exporte em PDF.')
    const canvas = renderPage(pages[0], plan, student, 0, 1)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao gerar PNG.')), 'image/png'))
    return new File([blob], name, { type: 'image/png' })
  }
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
  pages.forEach((page, i) => {
    if (i) pdf.addPage()
    const canvas = renderPage(page, plan, student, i, pages.length)
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST')
    canvas.width = 0; canvas.height = 0
  })
  return new File([pdf.output('blob')], name, { type: 'application/pdf' })
}
