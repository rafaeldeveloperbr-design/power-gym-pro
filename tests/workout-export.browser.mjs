// Start Vite locally, then set PLAYWRIGHT_MODULE_PATH to an external
// playwright-core installation and CHROME_PATH to a Chrome/Edge executable.
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import assert from 'node:assert/strict'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
try {
  const page = await browser.newPage()
  await page.route('https://*.supabase.co/**', route => route.abort())
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/')
  await page.waitForLoadState('networkidle')
  const create = async (width, format, count) => {
    await page.setViewportSize({ width, height: 900 })
    return page.evaluate(async ({ format, count }) => {
      const { createWorkoutFile } = await import('/src/lib/workout-export.ts')
      const plan = { id: 'fixture', alunoId: 'fixture', nome: 'Hipertrofia ABCD', data: '27/10/2026', divisoes: Array.from({ length: 4 }, (_, i) => ({
        id: `d${i}`, codigo: String.fromCharCode(65 + i), nome: ['Peito e tríceps', 'Costas e bíceps', 'Pernas e panturrilhas', 'Ombros e core'][i],
        exercicios: Array.from({ length: count }, (_, j) => ({ id: `e${j}`, nome: ['Supino reto com barra', 'Remada curvada', 'Agachamento livre', 'Desenvolvimento com halteres'][j % 4], grupo: 'Grupo', foco: '', instrucoes: '', equipamento: 'Barra', video_url: null, gif_url: null, series: '4', reps: '10-12', carga: '25 kg', descanso: '90s' })),
      })) }
      const file = await createWorkoutFile(plan, { nome: 'Aluno de teste', objetivo: 'HIPERTROFIA', peso: '80', altura: '180' }, format)
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary)
    }, { format, count })
  }
  const mobile = Buffer.from(await create(390, 'png', 8), 'base64')
  const desktop = Buffer.from(await create(1440, 'png', 8), 'base64')
  assert.ok(mobile.equals(desktop), 'PNG must be identical across mobile and desktop viewports')
  const pdf = Buffer.from(await create(390, 'pdf', 45), 'base64')
  const pdfText = pdf.toString('latin1')
  const pages = (pdfText.match(/\/Type \/Page\b/g) || []).length
  assert.ok(pages > 1)
  const media = pdfText.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)
  assert.ok(media && Math.abs(Number(media[1]) - 595.28) < 0.01 && Math.abs(Number(media[2]) - 841.89) < 0.01, 'A4 dimensions required')
  assert.ok(pdf.length < 10_000_000, 'Long PDF should remain practical to share')
  const directory = path.join(os.tmpdir(), 'power-gym-export-validation')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'ABCD.png'), mobile)
  fs.writeFileSync(path.join(directory, 'long-plan.pdf'), pdf)
  console.log(JSON.stringify({ identicalPngAcrossViewports: true, pdfPages: pages, pngBytes: mobile.length, pdfBytes: pdf.length, artifacts: directory }))
} finally { await browser.close() }
