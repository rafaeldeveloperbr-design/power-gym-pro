import { useState, useEffect, useRef, Fragment } from 'react'
import type { ReactNode } from 'react'
import {
  Dumbbell, Layers, Users, Plus, Minus, Search, X, Play, Pencil, Trash2, Copy, ClipboardCopy,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MessageCircle, Image as ImageIcon, FileText,
  Weight, Ruler, FolderPlus, LogOut, Paperclip, UserPlus, Save,
} from 'lucide-react'

import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

import { supabase } from './lib/supabase'
import { loadCatalog, saveRemoteTemplate, remoteError } from './lib/catalog'
import { loadWorkouts, saveWorkout, deleteWorkout, makeDivision, updateDivision, removeDivision } from './lib/workouts'
import type { WorkoutPlan as Ficha, WorkoutDivision } from './lib/workouts'


/* =========================================================
   TIPOS
   ========================================================= */
type Objetivo = 'HIPERTROFIA' | 'EMAGRECIMENTO' | 'FORÇA' | 'DEFINIÇÃO'
type Grupo = string
type Nivel = 'INICIANTE' | 'INTERMEDIÁRIO' | 'AVANÇADO'

interface Aluno { id: string; nome: string; objetivo: Objetivo; peso: string; altura: string; whatsapp: string; observacoes: string }
interface Exercicio {
  id: string; nome: string; grupo: Grupo; foco: string; instrucoes: string
  video_url: string | null; gif_url: string | null; equipamento: string
}
interface ExercicioFicha extends Exercicio { series: string; reps: string; carga: string; descanso: string }
interface Template { id: string; nome: string; objetivo: Objetivo; nivel: Nivel; descricao: string; exercicios: ExercicioFicha[]; dataCriacao: string }

const OBJETIVOS: Objetivo[] = ['HIPERTROFIA', 'EMAGRECIMENTO', 'FORÇA', 'DEFINIÇÃO']
const NIVEIS: Nivel[] = ['INICIANTE', 'INTERMEDIÁRIO', 'AVANÇADO']
const CATEGORIAS_INICIAIS: Grupo[] = ['Peito', 'Costas', 'Perna', 'Braço', 'Ombro', 'Core', 'Cardio']

/* =========================================================
   BIBLIOTECA DE 100 EXERCÍCIOS
   [nome, grupo, foco, equipamento, instruções]
   ========================================================= */
const RAW: [string, string, string, string, string][] = [
  // ---------- PEITO (15) ----------
  ['Supino Reto Barra', 'Peito', 'Peitoral maior, deltoide anterior e tríceps', 'Barra e banco reto', 'Deite com os pés firmes no chão e as escápulas retraídas. Retire a barra do suporte, desça controlando até a linha do mamilo e empurre até estender os cotovelos sem travá-los.'],
  ['Supino Inclinado Barra', 'Peito', 'Peitoral superior e deltoide anterior', 'Barra e banco inclinado (30°–45°)', 'Com o banco inclinado, desça a barra até a parte alta do peito mantendo os cotovelos a cerca de 45° do tronco e empurre de volta até a extensão.'],
  ['Supino Declinado Barra', 'Peito', 'Peitoral inferior e tríceps', 'Barra e banco declinado', 'Prenda os pés no apoio, desça a barra de forma controlada até a parte baixa do peito e empurre sem projetar os ombros à frente.'],
  ['Supino Reto Halteres', 'Peito', 'Peitoral maior e estabilizadores do ombro', 'Halteres e banco reto', 'Parta com os halteres alinhados ao peito, desça até sentir alongamento sem perder o controle e suba aproximando os halteres no topo.'],
  ['Supino Inclinado Halteres', 'Peito', 'Peitoral superior', 'Halteres e banco inclinado', 'Banco a 30°–45°. Desça os halteres ao lado do peito, cotovelos semiabertos, e empurre em arco até quase juntá-los no topo.'],
  ['Crucifixo Reto Halteres', 'Peito', 'Peitoral maior (alongamento e adução)', 'Halteres e banco reto', 'Com leve flexão nos cotovelos, abra os braços em arco até sentir alongamento no peito e retorne como se abraçasse uma árvore.'],
  ['Crucifixo Inclinado Halteres', 'Peito', 'Peitoral superior', 'Halteres e banco inclinado', 'Mantenha os cotovelos levemente flexionados, abra os braços em arco amplo e retorne contraindo a parte alta do peito.'],
  ['Crossover Polia Alta', 'Peito', 'Peitoral inferior e esterno', 'Polia dupla (crossover)', 'Em pé, com leve inclinação do tronco, puxe as manoplas em arco de cima para baixo até cruzá-las à frente do quadril e retorne devagar.'],
  ['Crossover Polia Baixa', 'Peito', 'Peitoral superior', 'Polia dupla (crossover)', 'Com as polias na posição baixa, eleve as manoplas em arco até a altura do queixo, contraia o peito no topo e retorne controlando.'],
  ['Peck Deck / Voador', 'Peito', 'Peitoral maior (adução)', 'Máquina peck deck', 'Ajuste o banco para que as mãos fiquem na altura do peito, junte os braços à frente contraindo o peitoral e retorne sem deixar o peso encostar.'],
  ['Supino Máquina', 'Peito', 'Peitoral maior e tríceps', 'Máquina de supino', 'Ajuste o banco para que as pegadas fiquem na linha do peito, empurre até estender os braços e retorne controlando a fase negativa.'],
  ['Flexão de Braço', 'Peito', 'Peitoral, tríceps e core', 'Peso corporal', 'Mãos um pouco além da largura dos ombros, corpo em linha reta da cabeça aos calcanhares. Desça até o peito quase tocar o chão e empurre.'],
  ['Pullover Halter', 'Peito', 'Peitoral e grande dorsal', 'Halter e banco reto', 'Deitado transversalmente ao banco, segure o halter com as duas mãos, desça-o atrás da cabeça com cotovelos levemente flexionados e retorne sobre o peito.'],
  ['Supino Fechado', 'Peito', 'Tríceps e peitoral interno', 'Barra e banco reto', 'Pegada na largura dos ombros, cotovelos próximos ao corpo. Desça a barra até a parte baixa do peito e empurre focando o tríceps.'],
  ['Chest Press Inclinado Máquina', 'Peito', 'Peitoral superior', 'Máquina chest press inclinada', 'Ajuste o assento, mantenha as costas apoiadas e empurre as manoplas para cima e à frente, retornando com controle até alongar o peito.'],

  // ---------- COSTAS (15) ----------
  ['Puxada Frente Aberta', 'Costas', 'Grande dorsal e redondo maior', 'Polia alta e barra longa', 'Pegada pronada mais larga que os ombros, tronco levemente inclinado. Puxe a barra até a altura do queixo levando os cotovelos para baixo e retorne devagar.'],
  ['Puxada Frente Fechada', 'Costas', 'Grande dorsal (porção inferior) e bíceps', 'Polia alta e triângulo/barra fechada', 'Pegada fechada, peito aberto. Puxe até a parte alta do peito aproximando os cotovelos do corpo e retorne alongando o dorsal.'],
  ['Puxada Atrás', 'Costas', 'Grande dorsal, trapézio e romboides', 'Polia alta e barra longa', 'Incline levemente a cabeça à frente e puxe a barra até a altura da nuca sem forçar os ombros. Use carga moderada e amplitude confortável.'],
  ['Remada Baixa Triângulo', 'Costas', 'Dorsal, romboides e trapézio médio', 'Polia baixa e triângulo', 'Sentado com a coluna neutra, puxe o triângulo até o abdômen juntando as escápulas e retorne estendendo os braços sem arredondar as costas.'],
  ['Remada Baixa Aberta', 'Costas', 'Trapézio médio, romboides e deltoide posterior', 'Polia baixa e barra reta', 'Pegada aberta, cotovelos afastados do tronco. Puxe a barra até a altura do peito e retorne com controle.'],
  ['Remada Curvada Barra', 'Costas', 'Dorsal, romboides e eretores da espinha', 'Barra livre', 'Incline o tronco a cerca de 45° com a coluna neutra, puxe a barra até a linha do umbigo e desça devagar sem balançar o corpo.'],
  ['Remada Unilateral Halter', 'Costas', 'Grande dorsal e romboides', 'Halter e banco', 'Apoie uma mão e o joelho no banco, puxe o halter em direção ao quadril mantendo o cotovelo próximo ao corpo e desça alongando o dorsal.'],
  ['Barra Fixa Pronada', 'Costas', 'Grande dorsal, redondo maior e bíceps', 'Barra fixa', 'Pegada pronada mais larga que os ombros. Suba até o queixo passar da barra, sem balançar, e desça controlando até quase estender os braços.'],
  ['Barra Fixa Supinada', 'Costas', 'Dorsal e bíceps', 'Barra fixa', 'Pegada supinada na largura dos ombros. Suba contraindo as costas até o queixo passar da barra e desça com controle.'],
  ['Pulldown Corda', 'Costas', 'Grande dorsal (isolamento)', 'Polia alta e corda', 'Com os braços estendidos, puxe a corda em direção às coxas mantendo o tronco levemente inclinado e contraindo o dorsal ao final.'],
  ['Remada Máquina', 'Costas', 'Dorsal e romboides', 'Máquina de remada sentada', 'Peito apoiado no suporte, puxe as manoplas até as escápulas se aproximarem e retorne devagar sem soltar o peso.'],
  ['Remada Cavalinho', 'Costas', 'Espessura das costas, dorsal e trapézio', 'Barra T / máquina cavalinho', 'Incline o tronco com a coluna neutra, puxe a carga em direção ao peito levando os cotovelos para trás e desça controlando.'],
  ['Hiperextensão Lombar', 'Costas', 'Eretores da espinha, glúteos e isquiotibiais', 'Banco de hiperextensão', 'Quadril apoiado no suporte, desça o tronco com a coluna neutra e suba até alinhar o corpo, sem hiperestender a lombar no topo.'],
  ['Encolhimento Barra', 'Costas', 'Trapézio superior', 'Barra livre', 'Em pé, com a barra à frente das coxas, eleve os ombros em direção às orelhas, segure 1s e desça devagar sem girar os ombros.'],
  ['Levantamento Terra', 'Costas', 'Cadeia posterior: eretores, glúteos e isquiotibiais', 'Barra livre e anilhas', 'Pés na largura do quadril, barra rente às canelas. Mantenha a coluna neutra, empurre o chão e estenda quadril e joelhos juntos, descendo a barra rente ao corpo.'],

  // ---------- PERNA (25) ----------
  ['Agachamento Livre', 'Perna', 'Quadríceps, glúteos e core', 'Barra livre e rack', 'Barra apoiada no trapézio, pés na largura dos ombros. Desça com a coluna neutra até as coxas ficarem paralelas ao chão e suba empurrando o chão.'],
  ['Agachamento Smith', 'Perna', 'Quadríceps e glúteos', 'Máquina Smith', 'Posicione os pés levemente à frente da barra, desça até 90° nos joelhos mantendo o tronco firme e suba sem travar as articulações.'],
  ['Agachamento Frontal', 'Perna', 'Quadríceps e core', 'Barra livre e rack', 'Barra apoiada na frente dos ombros com cotovelos altos. Mantenha o tronco ereto, desça até o paralelo e suba.'],
  ['Leg Press 45°', 'Perna', 'Quadríceps, glúteos e adutores', 'Leg press 45°', 'Pés na largura dos ombros na plataforma. Desça até cerca de 90° sem descolar o quadril do banco e empurre sem travar os joelhos.'],
  ['Leg Press Horizontal', 'Perna', 'Quadríceps e glúteos', 'Leg press horizontal', 'Costas apoiadas no encosto, empurre a plataforma até quase estender os joelhos e retorne com controle sem tirar o quadril do assento.'],
  ['Cadeira Extensora', 'Perna', 'Quadríceps (isolamento)', 'Cadeira extensora', 'Ajuste o encosto, estenda os joelhos até quase a extensão total, segure 1s contraindo o quadríceps e desça devagar.'],
  ['Cadeira Flexora Deitada', 'Perna', 'Isquiotibiais', 'Máquina flexora deitada', 'Deitado com o quadril apoiado, flexione os joelhos levando os calcanhares em direção aos glúteos e retorne controlando.'],
  ['Cadeira Flexora Sentada', 'Perna', 'Isquiotibiais', 'Máquina flexora sentada', 'Ajuste o apoio das coxas, flexione os joelhos até o máximo confortável e volte devagar sem deixar a carga bater.'],
  ['Mesa Flexora', 'Perna', 'Isquiotibiais e panturrilha', 'Mesa flexora', 'Deitado de bruços, flexione os joelhos levando o rolo em direção aos glúteos, contraia no topo e retorne lentamente.'],
  ['Cadeira Adutora', 'Perna', 'Adutores', 'Cadeira adutora', 'Sentado com as costas apoiadas, una as pernas controlando o movimento e retorne devagar, sem usar impulso.'],
  ['Cadeira Abdutora', 'Perna', 'Glúteo médio e abdutores', 'Cadeira abdutora', 'Com as costas apoiadas, abra as pernas até a amplitude confortável, contraia o glúteo e retorne com controle.'],
  ['Stiff Barra', 'Perna', 'Isquiotibiais e glúteos', 'Barra livre', 'Joelhos levemente flexionados, empurre o quadril para trás deslizando a barra rente às pernas até sentir alongamento posterior e retorne contraindo os glúteos.'],
  ['Stiff Halteres', 'Perna', 'Isquiotibiais e glúteos', 'Halteres', 'Com a coluna neutra, leve o quadril para trás descendo os halteres rente às coxas e suba estendendo o quadril.'],
  ['Terra Sumô', 'Perna', 'Glúteos, adutores e isquiotibiais', 'Barra livre e anilhas', 'Base larga com pés levemente abertos, pegada estreita entre as pernas. Mantenha o peito aberto e suba empurrando o chão até estender o quadril.'],
  ['Afundo com Halteres', 'Perna', 'Quadríceps e glúteos', 'Halteres', 'Dê um passo à frente e desça até ambos os joelhos formarem cerca de 90°, mantendo o tronco ereto. Empurre com o pé da frente para voltar.'],
  ['Afundo no Smith', 'Perna', 'Quadríceps e glúteos', 'Máquina Smith', 'Posicione um pé à frente sob a barra, desça controlando até 90° no joelho da frente e suba sem travar.'],
  ['Agachamento Búlgaro', 'Perna', 'Quadríceps, glúteos e equilíbrio', 'Banco e halteres', 'Apoie o pé de trás no banco, desça com o tronco levemente inclinado até a coxa da frente ficar paralela ao chão e suba empurrando o calcanhar.'],
  ['Elevação Pélvica / Hip Thrust', 'Perna', 'Glúteo máximo', 'Banco e barra', 'Costas apoiadas no banco, barra sobre o quadril. Eleve o quadril até alinhar tronco e coxas, contraia os glúteos por 1s e desça controlando.'],
  ['Glúteo no Cabo / Chute', 'Perna', 'Glúteo máximo', 'Polia baixa e tornozeleira', 'Com a tornozeleira presa, chute a perna para trás estendendo o quadril sem arquear a lombar e retorne devagar.'],
  ['Glúteo Máquina', 'Perna', 'Glúteo máximo', 'Máquina de glúteo', 'Apoie o tronco, empurre a plataforma para trás com o calcanhar contraindo o glúteo e retorne com controle.'],
  ['Panturrilha em Pé Máquina', 'Perna', 'Gastrocnêmio', 'Máquina de panturrilha em pé', 'Ombros sob os apoios, suba na ponta dos pés ao máximo, segure 1s e desça alongando bem o calcanhar abaixo da plataforma.'],
  ['Panturrilha Sentada', 'Perna', 'Sóleo', 'Máquina de panturrilha sentada', 'Com os joelhos a 90° sob o apoio, suba na ponta dos pés, contraia e desça devagar até o alongamento total.'],
  ['Panturrilha Leg Press', 'Perna', 'Gastrocnêmio e sóleo', 'Leg press', 'Apoie apenas a ponta dos pés na plataforma com joelhos quase estendidos, empurre subindo na ponta dos pés e retorne alongando.'],
  ['Passada com Barra', 'Perna', 'Quadríceps, glúteos e isquiotibiais', 'Barra livre', 'Com a barra nas costas, dê passos largos alternados descendo o joelho de trás próximo ao chão e empurre o corpo para a frente a cada passo.'],
  ['Agachamento Hack', 'Perna', 'Quadríceps', 'Máquina hack', 'Costas apoiadas no encosto, pés na plataforma na largura dos ombros. Desça até 90° ou mais e suba sem travar os joelhos.'],

  // ---------- OMBRO (15) ----------
  ['Desenvolvimento Militar Barra', 'Ombro', 'Deltoides e tríceps', 'Barra livre', 'Em pé, com core firme, empurre a barra da altura da clavícula até acima da cabeça e desça controlando sem arquear a lombar.'],
  ['Desenvolvimento Militar Halteres', 'Ombro', 'Deltoides e tríceps', 'Halteres e banco com encosto', 'Sentado, empurre os halteres da altura das orelhas até estender os braços acima da cabeça e desça com controle.'],
  ['Desenvolvimento Arnold', 'Ombro', 'Deltoides (três porções)', 'Halteres e banco', 'Comece com as palmas voltadas para você; ao subir, gire os punhos até as palmas ficarem para a frente e estenda os braços. Inverta o movimento ao descer.'],
  ['Elevação Lateral Halteres', 'Ombro', 'Deltoide lateral', 'Halteres', 'Em pé, eleve os halteres lateralmente até a altura dos ombros com cotovelos levemente flexionados e desça devagar sem balançar.'],
  ['Elevação Lateral Polia', 'Ombro', 'Deltoide lateral', 'Polia baixa', 'Com a polia ao lado, eleve o braço lateralmente até a altura do ombro, mantendo tensão constante, e retorne com controle.'],
  ['Elevação Frontal Halteres', 'Ombro', 'Deltoide anterior', 'Halteres', 'Eleve os halteres à frente até a altura dos olhos, com leve flexão nos cotovelos, e desça lentamente sem usar impulso.'],
  ['Elevação Frontal Barra', 'Ombro', 'Deltoide anterior', 'Barra reta ou W', 'Segure a barra à frente das coxas, eleve até a altura dos ombros mantendo o tronco estável e desça controlando.'],
  ['Crucifixo Inverso Máquina', 'Ombro', 'Deltoide posterior e romboides', 'Máquina peck deck (invertida)', 'Com o peito apoiado, abra os braços para trás até a linha dos ombros contraindo a parte posterior e retorne devagar.'],
  ['Remada Alta Barra', 'Ombro', 'Deltoide lateral e trapézio superior', 'Barra livre', 'Segure a barra com pegada na largura dos ombros e puxe até o peito conduzindo os cotovelos para cima, sem passar da altura dos ombros.'],
  ['Face Pull', 'Ombro', 'Deltoide posterior, manguito rotador e trapézio', 'Polia alta e corda', 'Puxe a corda em direção ao rosto levando os cotovelos para fora e para trás, separando as pontas da corda ao final do movimento.'],
  ['Encolhimento Halteres', 'Ombro', 'Trapézio superior', 'Halteres', 'Com os halteres ao lado do corpo, eleve os ombros em direção às orelhas, segure 1s e desça com controle.'],
  ['Elevação Lateral Inclinada', 'Ombro', 'Deltoide posterior', 'Halteres e banco inclinado', 'Deitado de bruços no banco inclinado, abra os halteres lateralmente até a linha dos ombros e retorne com controle.'],
  ['Desenvolvimento Máquina', 'Ombro', 'Deltoides e tríceps', 'Máquina de desenvolvimento', 'Ajuste o banco para que as pegadas fiquem na altura dos ombros, empurre até estender os braços e retorne controlando.'],
  ['Remada Alta Polia', 'Ombro', 'Deltoide lateral e trapézio', 'Polia baixa e barra reta', 'Puxe a barra rente ao corpo até a altura do peito com os cotovelos acima das mãos e desça devagar.'],
  ['Elevação Lateral Polia Baixa', 'Ombro', 'Deltoide lateral', 'Polia baixa', 'Com a polia cruzando o corpo, eleve o braço lateralmente até a altura do ombro e retorne lentamente mantendo a tensão.'],

  // ---------- BRAÇO (15) ----------
  ['Rosca Direta Barra Reta', 'Braço', 'Bíceps braquial', 'Barra reta', 'Em pé, cotovelos fixos ao lado do corpo, flexione os cotovelos levando a barra até a altura do peito e desça devagar sem balançar o tronco.'],
  ['Rosca Direta Barra W', 'Braço', 'Bíceps braquial', 'Barra W', 'A barra W reduz o estresse nos punhos. Flexione os cotovelos mantendo-os fixos e controle a descida.'],
  ['Rosca Martelo', 'Braço', 'Braquial e braquiorradial', 'Halteres', 'Com as palmas voltadas uma para a outra, flexione os cotovelos mantendo os punhos neutros e desça com controle.'],
  ['Rosca Alternada Halteres', 'Braço', 'Bíceps braquial', 'Halteres', 'Alterne os braços, girando o punho para cima durante a subida e mantendo os cotovelos junto ao tronco.'],
  ['Rosca Scott Barra', 'Braço', 'Bíceps braquial (porção curta)', 'Banco Scott e barra W', 'Apoie os braços no banco, desça a barra até quase estender os cotovelos e suba contraindo o bíceps sem tirar os braços do apoio.'],
  ['Rosca Scott Halter', 'Braço', 'Bíceps braquial', 'Banco Scott e halter', 'Apoie o braço no banco, flexione o cotovelo até o topo e desça devagar, alongando bem o bíceps.'],
  ['Rosca Concentrada', 'Braço', 'Bíceps braquial (pico)', 'Halter e banco', 'Sentado, apoie o cotovelo na parte interna da coxa e flexione o braço até o topo, contraindo o bíceps ao final.'],
  ['Rosca Inversa', 'Braço', 'Braquiorradial e antebraço', 'Barra reta ou W', 'Pegada pronada, mantenha os cotovelos fixos e flexione levando a barra até a altura do peito com punhos neutros.'],
  ['Tríceps Testa Barra W', 'Braço', 'Tríceps braquial', 'Barra W e banco', 'Deitado, desça a barra em direção à testa flexionando os cotovelos sem abri-los e estenda os braços até o topo.'],
  ['Tríceps Testa Halteres', 'Braço', 'Tríceps braquial', 'Halteres e banco', 'Deitado, flexione os cotovelos descendo os halteres ao lado da cabeça e estenda os braços mantendo os cotovelos fixos.'],
  ['Tríceps Corda Polia Alta', 'Braço', 'Tríceps braquial (cabeça lateral)', 'Polia alta e corda', 'Cotovelos fixos ao lado do corpo, estenda os braços abrindo as pontas da corda ao final e retorne devagar.'],
  ['Tríceps Barra Reta Polia', 'Braço', 'Tríceps braquial', 'Polia alta e barra reta', 'Com os cotovelos junto ao tronco, empurre a barra para baixo até estender os braços e retorne controlando até 90°.'],
  ['Tríceps Francês Halter', 'Braço', 'Tríceps braquial (cabeça longa)', 'Halter', 'Segure o halter com as duas mãos acima da cabeça, desça atrás da nuca flexionando os cotovelos e estenda de volta.'],
  ['Tríceps Mergulho Banco', 'Braço', 'Tríceps braquial', 'Banco', 'Com as mãos no banco atrás do corpo, flexione os cotovelos descendo o quadril e empurre para cima até estender os braços.'],
  ['Tríceps Mergulho Paralelas', 'Braço', 'Tríceps e peitoral inferior', 'Barras paralelas', 'Com o tronco ereto para foco no tríceps, desça até 90° nos cotovelos e empurre de volta sem travá-los.'],

  // ---------- CORE (15) ----------
  ['Abdominal Reto Solo', 'Core', 'Reto abdominal', 'Colchonete', 'Deitado com joelhos flexionados, eleve o tronco contraindo o abdômen sem puxar o pescoço e desça com controle.'],
  ['Elevação de Pernas', 'Core', 'Reto abdominal inferior e flexores do quadril', 'Banco ou barra', 'Mantenha as costas apoiadas e eleve as pernas até o quadril formar cerca de 90°; desça sem deixar a lombar sair do apoio.'],
  ['Abdominal Oblíquo', 'Core', 'Oblíquos', 'Colchonete', 'Deitado, leve o cotovelo em direção ao joelho oposto girando o tronco, contraindo os oblíquos, e alterne os lados.'],
  ['Prancha Isométrica', 'Core', 'Core profundo e reto abdominal', 'Colchonete', 'Apoie antebraços e pontas dos pés, mantenha o corpo em linha reta contraindo abdômen e glúteos durante todo o tempo.'],
  ['Prancha Lateral', 'Core', 'Oblíquos e glúteo médio', 'Colchonete', 'Apoiado em um antebraço, eleve o quadril alinhando corpo da cabeça aos pés e mantenha a posição, alternando os lados.'],
  ['Abdominal na Polia Alta', 'Core', 'Reto abdominal', 'Polia alta e corda', 'Ajoelhado, com a corda junto à cabeça, flexione o tronco levando os cotovelos em direção aos joelhos e retorne com controle.'],
  ['Abdominal Máquina', 'Core', 'Reto abdominal', 'Máquina de abdominal', 'Ajuste a carga, flexione o tronco contraindo o abdômen e retorne devagar sem deixar o peso descansar.'],
  ['Elevação de Joelho na Barra', 'Core', 'Reto abdominal inferior', 'Barra fixa', 'Pendurado na barra, eleve os joelhos até o peito sem balançar o corpo e desça com controle.'],
  ['Abdominal Bicicleta', 'Core', 'Reto abdominal e oblíquos', 'Colchonete', 'Deitado, alterne cotovelo e joelho opostos num movimento de pedalada, mantendo o abdômen contraído.'],
  ['Russian Twist', 'Core', 'Oblíquos e reto abdominal', 'Colchonete e anilha/halter (opcional)', 'Sentado com o tronco inclinado e pés elevados, gire o tronco de um lado ao outro tocando a carga ao lado do quadril.'],
  ['Hiperextensão Lombar no Solo', 'Core', 'Eretores da espinha e glúteos', 'Colchonete', 'Deitado de bruços, eleve tronco e pernas simultaneamente contraindo a lombar e os glúteos, sem hiperestender o pescoço.'],
  ['Abdominal com Roda', 'Core', 'Reto abdominal e core profundo', 'Roda abdominal', 'De joelhos, role a roda à frente mantendo a coluna neutra e contraindo o abdômen, e retorne puxando com o core.'],
  ['Elevação de Pernas Deitado', 'Core', 'Reto abdominal inferior', 'Colchonete', 'Deitado, com as pernas estendidas, eleve-as até 90° sem arquear a lombar e desça devagar sem tocar o chão.'],
  ['Abdominal Canivete', 'Core', 'Reto abdominal completo', 'Colchonete', 'Deitado, eleve simultaneamente tronco e pernas tentando tocar os pés com as mãos e retorne com controle.'],
  ['V-Up', 'Core', 'Reto abdominal e flexores do quadril', 'Colchonete', 'Braços estendidos acima da cabeça, eleve tronco e pernas formando um V, toque os pés e desça controlando.'],
]

const BASE: Exercicio[] = RAW.map(([nome, grupo, foco, equipamento, instrucoes], i) => ({
  id: 'ex' + (i + 1), nome, grupo, foco, equipamento, instrucoes, video_url: null, gif_url: null,
}))

const ef = (nome: string, series: string, reps: string, carga: string, descanso: string): ExercicioFicha => {
  const b = BASE.find((e) => e.nome === nome)
  if (!b) throw new Error('Exercício não encontrado: ' + nome)
  return { ...b, series, reps, carga, descanso }
}

const hoje = () => new Date().toLocaleDateString('pt-BR')

/* =========================================================
   TEMPLATES INICIAIS
   ========================================================= */
const TEMPLATES_INICIAIS: Template[] = [
  {
    id: 't1', nome: 'Hipertrofia ABC Iniciante', objetivo: 'HIPERTROFIA', nivel: 'INICIANTE',
    descricao: '3 dias por semana com máquinas e exercícios livres básicos para construir base de hipertrofia.',
    dataCriacao: hoje(),
    exercicios: [
      ef('Supino Máquina', '3', '10-12', 'Moderada', '60-90s'),
      ef('Puxada Frente Aberta', '3', '10-12', 'Moderada', '60-90s'),
      ef('Leg Press 45°', '3', '12', 'Moderada', '90s'),
      ef('Desenvolvimento Máquina', '3', '10-12', 'Leve a moderada', '60s'),
      ef('Rosca Direta Barra W', '3', '10-12', 'Leve a moderada', '60s'),
      ef('Tríceps Corda Polia Alta', '3', '12', 'Leve a moderada', '60s'),
    ],
  },
  {
    id: 't2', nome: 'Hipertrofia Peito e Tríceps Avançado', objetivo: 'HIPERTROFIA', nivel: 'AVANÇADO',
    descricao: 'Treino de volume alto para peitoral e tríceps, com múltiplos ângulos e técnicas de intensidade.',
    dataCriacao: hoje(),
    exercicios: [
      ef('Supino Reto Barra', '5', '6-8', 'Pesada', '120s'),
      ef('Supino Inclinado Halteres', '4', '8-10', 'Moderada a pesada', '90s'),
      ef('Crucifixo Inclinado Halteres', '4', '10-12', 'Moderada', '75s'),
      ef('Crossover Polia Alta', '4', '12-15', 'Moderada', '60s'),
      ef('Tríceps Testa Barra W', '4', '8-10', 'Moderada a pesada', '75s'),
      ef('Tríceps Corda Polia Alta', '4', '12-15', 'Moderada', '60s'),
    ],
  },
  {
    id: 't3', nome: 'Emagrecimento Full Body 3x', objetivo: 'EMAGRECIMENTO', nivel: 'INICIANTE',
    descricao: 'Circuito de corpo inteiro com descanso curto para elevar o gasto calórico. 3 vezes por semana.',
    dataCriacao: hoje(),
    exercicios: [
      ef('Agachamento Livre', '3', '15', 'Leve', '30s'),
      ef('Supino Reto Halteres', '3', '15', 'Leve', '30s'),
      ef('Remada Baixa Triângulo', '3', '15', 'Leve', '30s'),
      ef('Desenvolvimento Militar Halteres', '3', '12', 'Leve', '30s'),
      ef('Prancha Isométrica', '3', '30-45s', 'Peso corporal', '30s'),
      ef('Abdominal Bicicleta', '3', '20', 'Peso corporal', '30s'),
    ],
  },
  {
    id: 't4', nome: 'Força 5x5 Strong', objetivo: 'FORÇA', nivel: 'AVANÇADO',
    descricao: 'Base de força com 5 séries de 5 repetições nos movimentos compostos principais.',
    dataCriacao: hoje(),
    exercicios: [
      ef('Agachamento Livre', '5', '5', 'Pesada (80-85% 1RM)', '180s'),
      ef('Supino Reto Barra', '5', '5', 'Pesada (80-85% 1RM)', '180s'),
      ef('Levantamento Terra', '3', '5', 'Pesada', '180s'),
      ef('Desenvolvimento Militar Barra', '5', '5', 'Pesada', '150s'),
      ef('Remada Curvada Barra', '5', '5', 'Pesada', '150s'),
      ef('Barra Fixa Pronada', '4', '6-8', 'Peso corporal + carga', '120s'),
    ],
  },
  {
    id: 't5', nome: 'Definição Glúteos e Inferiores', objetivo: 'DEFINIÇÃO', nivel: 'INTERMEDIÁRIO',
    descricao: 'Foco em glúteos e posteriores de coxa, com exercícios de tensão contínua para definição.',
    dataCriacao: hoje(),
    exercicios: [
      ef('Elevação Pélvica / Hip Thrust', '4', '10-12', 'Moderada a pesada', '90s'),
      ef('Agachamento Búlgaro', '3', '10-12 cada', 'Moderada', '75s'),
      ef('Stiff Halteres', '4', '10-12', 'Moderada', '75s'),
      ef('Glúteo no Cabo / Chute', '3', '12-15 cada', 'Leve a moderada', '45-60s'),
      ef('Cadeira Abdutora', '4', '15', 'Moderada', '45s'),
      ef('Terra Sumô', '3', '8-10', 'Moderada a pesada', '90s'),
    ],
  },
]

const ALUNOS_INICIAIS: Aluno[] = [
  { id: 'a1', nome: 'João Pedro Santos', objetivo: 'HIPERTROFIA', peso: '78', altura: '178', whatsapp: '11999990001', observacoes: 'Leve desconforto no ombro direito. Evitar desenvolvimento atrás da nuca.' },
  { id: 'a2', nome: 'Maria Fernanda Oliveira', objetivo: 'EMAGRECIMENTO', peso: '65', altura: '165', whatsapp: '11999990002', observacoes: '' },
  { id: 'a3', nome: 'Carlos Eduardo Lima', objetivo: 'FORÇA', peso: '92', altura: '183', whatsapp: '11999990003', observacoes: 'Treina às 6h. Prefere barra livre.' },
  { id: 'a4', nome: 'Ana Beatriz Costa', objetivo: 'DEFINIÇÃO', peso: '58', altura: '160', whatsapp: '11999990004', observacoes: '' },
]

const clone = (l: ExercicioFicha[]) => l.map((e) => ({ ...e }))

/* =========================================================
   HELPERS E ESTILOS
   ========================================================= */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const iniciais = (nome: string) => nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const telefone = (p: string) => {
  const d = p.replace(/\D/g, '')
  if (!d) return ''
  return d.length <= 11 ? '55' + d : d
}
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const inputCls = 'w-full h-[42px] rounded-[10px] bg-[#0E0E0E] border border-[#222] px-3 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#444] transition'
const textareaCls = 'w-full rounded-[10px] bg-[#0E0E0E] border border-[#222] px-3 py-2.5 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#444] resize-none transition'
const btnPri = 'h-11 px-4 rounded-[10px] bg-white text-black font-bold text-[13px] hover:bg-[#E5E5E5] transition inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed'
const btnSec = 'h-9 px-3 rounded-[10px] bg-[#1E1E1E] border border-[#2A2A2A] text-[12px] text-white hover:bg-[#262626] transition inline-flex items-center justify-center gap-1.5'
const labelCls = 'block text-[10px] uppercase tracking-[0.12em] text-[#888] font-semibold mb-1.5'
const cardCls = 'bg-[#121212] border border-[#222] rounded-2xl'

const nivelCls: Record<Nivel, string> = {
  'INICIANTE': 'bg-green-500/15 text-green-400 border-green-500/30',
  'INTERMEDIÁRIO': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'AVANÇADO': 'bg-red-500/15 text-red-400 border-red-500/30',
}

/* =========================================================
   COMPONENTES (nível de módulo para não perder foco dos inputs)
   ========================================================= */
function LogoText({ size = 'default', variant = 'dark' }: { size?: 'large' | 'default' | 'small'; variant?: 'dark' | 'light' }) {
  const fs = size === 'large' ? 42 : size === 'small' ? 16 : 28
  const sub = size === 'large' ? 12 : size === 'small' ? 7 : 10
  return (
    <div className={`inline-flex flex-col items-center select-none leading-none ${variant === 'dark' ? 'text-white' : 'text-black'}`}>
      <div className="font-black flex items-baseline" style={{ fontSize: fs, letterSpacing: '-0.03em' }}>
        <span>"</span><span>POWER</span>
      </div>
      <div className="flex items-center font-medium mt-1.5" style={{ fontSize: sub, letterSpacing: '0.32em', gap: '0.32em' }}>
        <span className="h-px w-4 bg-current"></span><span>G</span><span>Y</span><span>M</span><span className="ml-2">P</span><span>R</span><span>O</span><span className="h-px w-4 bg-current"></span>
      </div>
    </div>
  )
}

function Overlay({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm md:p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'md:max-w-2xl' : 'md:max-w-lg'} bg-[#121212] border border-[#222] rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <Overlay onClose={onClose} wide={wide}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#222] sticky top-0 bg-[#121212] z-10">
        <h3 className="text-[14px] font-extrabold">{title}</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1A1A1A] border border-[#222] flex items-center justify-center text-[#888] hover:text-white">
          <X size={15} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </Overlay>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
      <input className={inputCls + ' pl-9'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`shrink-0 h-8 px-3 rounded-[10px] text-[11px] font-bold border transition ${value === o ? 'bg-white text-black border-white' : 'bg-[#1A1A1A] text-[#888] border-[#222] hover:text-white'
            }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function Biblioteca({
  biblioteca, categorias, ids, onAdd, onRemove,
}: {
  biblioteca: Exercicio[]; categorias: Grupo[]; ids: string[]
  onAdd: (e: Exercicio) => void; onRemove: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [g, setG] = useState('Todos')
  const list = biblioteca.filter(
    (e) => (g === 'Todos' || e.grupo === g) && norm(e.nome + ' ' + e.foco + ' ' + e.equipamento).includes(norm(q))
  )
  return (
    <div className={cardCls + ' p-4 flex flex-col'}>
      <p className={labelCls}>Biblioteca</p>
      <SearchBox value={q} onChange={setQ} placeholder="Buscar exercício..." />
      <div className="mt-3"><Chips options={['Todos', ...categorias]} value={g} onChange={setG} /></div>
      <div className="mt-3 space-y-1.5 max-h-[420px] lg:max-h-[640px] overflow-y-auto pr-1">
        {list.map((e) => {
          const on = ids.includes(e.id)
          return (
            <div key={e.id} className="flex items-center gap-2 bg-[#0E0E0E] border border-[#1E1E1E] rounded-[10px] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold truncate">{e.nome}</p>
                <p className="text-[10px] text-[#777] truncate">{e.grupo} • {e.equipamento}</p>
              </div>
              <button
                onClick={() => (on ? onRemove(e.id) : onAdd(e))}
                className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border transition ${on ? 'bg-[#1E1E1E] border-[#2A2A2A] text-red-400' : 'bg-white border-white text-black hover:bg-[#E5E5E5]'
                  }`}
                aria-label={on ? 'Remover' : 'Adicionar'}
              >
                {on ? <Minus size={14} /> : <Plus size={14} />}
              </button>
            </div>
          )
        })}
        {list.length === 0 && <p className="text-[12px] text-[#666] text-center py-6">Nenhum exercício encontrado.</p>}
      </div>
    </div>
  )
}

function ListaEditor({ lista, setLista }: { lista: ExercicioFicha[]; setLista: (l: ExercicioFicha[]) => void }) {
  const upd = (i: number, k: 'series' | 'reps' | 'carga' | 'descanso', v: string) =>
    setLista(lista.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= lista.length) return
    const c = [...lista]
      ;[c[i], c[j]] = [c[j], c[i]]
    setLista(c)
  }
  if (lista.length === 0)
    return <div className="border border-dashed border-[#2A2A2A] rounded-xl py-8 text-center text-[12px] text-[#666]">Adicione exercícios pela biblioteca.</div>
  return (
    <div className="space-y-2">
      {lista.map((e, i) => (
        <div key={e.id} className="bg-[#0E0E0E] border border-[#1E1E1E] rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-[#1A1A1A] border border-[#222] text-[10px] font-bold flex items-center justify-center text-[#888]">{i + 1}</span>
            <p className="flex-1 min-w-0 text-[12px] font-bold truncate">{e.nome}</p>
            <button onClick={() => move(i, -1)} className="w-7 h-7 rounded-md bg-[#1A1A1A] border border-[#222] flex items-center justify-center text-[#888] hover:text-white"><ChevronUp size={14} /></button>
            <button onClick={() => move(i, 1)} className="w-7 h-7 rounded-md bg-[#1A1A1A] border border-[#222] flex items-center justify-center text-[#888] hover:text-white"><ChevronDown size={14} /></button>
            <button onClick={() => setLista(lista.filter((_, idx) => idx !== i))} className="w-7 h-7 rounded-md bg-[#1A1A1A] border border-[#222] flex items-center justify-center text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5">
            {([['series', 'Séries'], ['reps', 'Reps'], ['carga', 'Carga'], ['descanso', 'Descanso']] as const).map(([k, l]) => (
              <div key={k}>
                <label className="block text-[9px] uppercase tracking-[0.12em] text-[#666] font-semibold mb-1">{l}</label>
                <input
                  className="w-full h-9 rounded-lg bg-[#1A1A1A] border border-[#222] px-2.5 text-[12px] outline-none focus:border-[#444]"
                  value={e[k]}
                  onChange={(ev) => upd(i, k, ev.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* =========================================================
   APP
   ========================================================= */
type Tab = 'exercicios' | 'templates' | 'alunos'
type View = 'main' | 'criarTemplate' | 'criarFicha' | 'ficha'

const FORM_ALUNO = { nome: '', objetivo: 'HIPERTROFIA' as Objetivo, whatsapp: '', peso: '', altura: '', observacoes: '' }
const FORM_EX = { nome: '', grupo: '', equipamento: '', foco: '', instrucoes: '', video_url: '', gif_url: '' }


export default function App() {

  /* ---------- auth ---------- */
  const [logado, setLogado] = useState(false)
  const [authCarregando, setAuthCarregando] = useState(true)
  const [authEnviando, setAuthEnviando] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [authErro, setAuthErro] = useState('')


  const [alunosRemotos, setAlunosRemotos] = useState<Aluno[]>([])
  const [consultandoAlunos, setConsultandoAlunos] = useState(false)
  const [erroConsultaAlunos, setErroConsultaAlunos] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [catalogReady, setCatalogReady] = useState(false)
  const [catalogBusy, setCatalogBusy] = useState(false)
  const catalogLock = useRef(false)
  const catalogSession = useRef(0)
  const [catalogRetry, setCatalogRetry] = useState(0)
  const [salvandoAluno, setSalvandoAluno] = useState(false)
  const [erroSalvarAluno, setErroSalvarAluno] = useState('')



  /* ---------- dados ---------- */

  const [alunos, setAlunos] = useState<Aluno[]>([])

  const [fichas, setFichas] = useState<Ficha[]>([])
  const [workoutLoading, setWorkoutLoading] = useState(true)
  const [workoutReady, setWorkoutReady] = useState(false)
  const [workoutError, setWorkoutError] = useState('')
  const [workoutRetry, setWorkoutRetry] = useState(0)
  const [workoutBusy, setWorkoutBusy] = useState(false)
  const workoutLock = useRef(false)
  const workoutSession = useRef(0)

  useEffect(() => {
    const session = ++workoutSession.current
    let cancelled = false
    setFichas([]); setWorkoutReady(false); setWorkoutError(''); setWorkoutLoading(logado)
    if (!logado) { setView('main'); setFDivisoes([]); return }
    loadWorkouts().then(plans => {
      if (cancelled || session !== workoutSession.current) return
      setFichas(plans); setWorkoutReady(true)
    }).catch(error => { if (!cancelled) setWorkoutError(remoteError(error)) })
      .finally(() => { if (!cancelled) setWorkoutLoading(false) })
    return () => { cancelled = true; ++workoutSession.current }
  }, [logado, workoutRetry])

  const [templates, setTemplates] = useState<Template[]>([])
  const [biblioteca, setBiblioteca] = useState<Exercicio[]>([])
  const [categorias, setCategorias] = useState<Grupo[]>([])

  useEffect(() => {
    const session = ++catalogSession.current
    setTemplates([]); setBiblioteca([]); setCategorias([])
    setCatalogReady(false); setCatalogError(''); setCatalogLoading(logado)
    if (!logado) return
    let cancelled = false
    loadCatalog().then(data => {
      if (cancelled || session !== catalogSession.current) return
      setBiblioteca(data.exercises); setCategorias(data.categories); setTemplates(data.templates as Template[])
      setCatalogReady(true)
    }).catch(error => {
      if (!cancelled) setCatalogError(remoteError(error))
    }).finally(() => { if (!cancelled) setCatalogLoading(false) })
    return () => { cancelled = true; ++catalogSession.current }
  }, [logado, catalogRetry])

  const catalogWrite = async (operation: (commit: (change: () => void) => void) => Promise<void>) => {
    if (catalogLock.current || !catalogReady) return
    const session = catalogSession.current
    catalogLock.current = true; setCatalogBusy(true)
    try { await operation(change => { if (session === catalogSession.current) change() }) }
    catch (error) { if (session === catalogSession.current) window.alert(remoteError(error)) }
    finally { catalogLock.current = false; setCatalogBusy(false) }
  }

  /* ---------- navegação ---------- */
  const [tab, setTab] = useState<Tab>('alunos')
  const [view, setView] = useState<View>('main')

  /* ---------- buscas ---------- */
  const [qAluno, setQAluno] = useState('')
  const [qTemplate, setQTemplate] = useState('')
  const [qEx, setQEx] = useState('')
  const [gEx, setGEx] = useState('Todos')

  /* ---------- modais ---------- */
  const [modalAluno, setModalAluno] = useState(false)
  const [alunoEditando, setAlunoEditando] = useState<string | null>(null)
  const [formAluno, setFormAluno] = useState(FORM_ALUNO)
  const [modalEx, setModalEx] = useState<{ editing: Exercicio | null } | null>(null)
  const [formEx, setFormEx] = useState(FORM_EX)
  const [modalCat, setModalCat] = useState(false)
  const [novaCat, setNovaCat] = useState('')
  const [exDetalhe, setExDetalhe] = useState<Exercicio | null>(null)
  const [anexar, setAnexar] = useState<{ templateId: string; alunoId: string } | null>(null)

  /* ---------- criar template ---------- */
  const [tplId, setTplId] = useState<string | null>(null)
  const [tplNome, setTplNome] = useState('')
  const [tplNivel, setTplNivel] = useState<Nivel>('INICIANTE')
  const [tplObj, setTplObj] = useState<Objetivo>('HIPERTROFIA')
  const [tplDesc, setTplDesc] = useState('')
  const [tplExs, setTplExs] = useState<ExercicioFicha[]>([])

  /* ---------- criar ficha ---------- */
  const [fAluno, setFAluno] = useState('')
  const [fNome, setFNome] = useState('')
  const [fTplId, setFTplId] = useState('')
  const [fEditId, setFEditId] = useState<string | null>(null)
  const [fData, setFData] = useState('')
  const [fDivisoes, setFDivisoes] = useState<WorkoutDivision[]>([])
  const [fDivisaoId, setFDivisaoId] = useState('')
  const fDivisao = fDivisoes.find(d => d.id === fDivisaoId)
  const fExs = fDivisao?.exercicios ?? []
  const setFExs = (exercicios: ExercicioFicha[]) => setFDivisoes(prev => updateDivision(prev, fDivisaoId, { exercicios }))

  /* ---------- ficha detalhe ---------- */
  const [fichaId, setFichaId] = useState<string | null>(null)
  const fichaRef = useRef<HTMLDivElement>(null)
  const [exportando, setExportando] = useState(false)
  const [menuWhats, setMenuWhats] = useState(false)

  useEffect(() => { window.scrollTo({ top: 0 }) }, [view, tab])


  /* ---------- AUTH ---------- */

  const validarSessao = async () => {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      setLogado(false)
      setAuthCarregando(false)
      return
    }

    const { data: funcionario, error: perfilErro } = await supabase
      .from('funcionarios')
      .select('id, nome, papel, ativo')
      .eq('id', user.id)
      .maybeSingle()

    if (perfilErro || !funcionario || !funcionario.ativo) {
      setLogado(false)
      setAuthErro(
        perfilErro
          ? 'Não foi possível validar suas permissões.'
          : 'Usuário não autorizado. Procure o administrador.'
      )
      await supabase.auth.signOut()
      setAuthCarregando(false)
      return
    }

    setAuthErro('')
    setLogado(true)
    setAuthCarregando(false)
  }

  useEffect(() => {
    void validarSessao()

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((evento) => {
        // Evita executar consultas Supabase dentro do callback.
        if (evento === 'SIGNED_OUT') {
          setLogado(false)
        }

        if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED') {
          queueMicrotask(() => {
            void validarSessao()
          })
        }
      })

    return () => subscription.unsubscribe()
  }, [])

  const entrar = async () => {
    if (authEnviando) return

    if (!email.trim() || !senha) {
      setAuthErro('Informe e-mail e senha.')
      return
    }

    setAuthEnviando(true)
    setAuthErro('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      })

      if (error) {
        setAuthErro('E-mail ou senha inválidos.')
        return
      }

      await validarSessao()
      setSenha('')
    } catch {
      setAuthErro('Erro de conexão. Tente novamente.')
    } finally {
      setAuthEnviando(false)
    }
  }

  const sair = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthErro('Não foi possível encerrar a sessão.')
      return
    }

    setLogado(false)
    setSenha('')
  }



  useEffect(() => {
    if (!logado) {
      setAlunos([])
      return
    }

    let cancelado = false

    const carregarAlunos = async () => {
      setConsultandoAlunos(true)
      setErroConsultaAlunos('')

      const { data, error } = await supabase
        .from('alunos')
        .select('id, nome, objetivo, peso, altura, whatsapp, observacoes')
        .order('nome', { ascending: true })

      if (cancelado) return

      if (error) {
        console.error('Erro ao carregar alunos:', error)
        setErroConsultaAlunos('Erro ao carregar alunos.')
      } else {
        setAlunos((data ?? []) as Aluno[])
        setAlunosRemotos((data ?? []) as Aluno[])
      }

      setConsultandoAlunos(false)
    }

    void carregarAlunos()

    return () => {
      cancelado = true
    }
  }, [logado])


  if (authCarregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080808] text-white">
        <p className="text-sm text-[#888]">
          Verificando acesso...
        </p>
      </div>
    )
  }


  if (!logado) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-10">
            <LogoText size="large" variant="dark" />
          </div>

          <div className={cardCls + ' p-6 space-y-4'}>
            <div>
              <h1 className="text-[18px] font-extrabold">
                Acesso do Treinador
              </h1>
              <p className="text-[12px] text-[#888] mt-1">
                Treino profissional. Resultados reais.
              </p>
            </div>

            <Field label="E-mail">
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                autoComplete="username"
              />
            </Field>

            <Field label="Senha">
              <input
                className={inputCls}
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                onKeyDown={(e) => e.key === 'Enter' && entrar()}
              />
            </Field>

            {authErro && (
              <p className="text-[12px] text-red-400">
                {authErro}
              </p>
            )}

            <button
              onClick={entrar}
              disabled={authEnviando}
              className={btnPri + ' w-full'}
            >
              {authEnviando ? 'ENTRANDO...' : 'ENTRAR'}
            </button>
          </div>
        </div>
      </div>
    )
  }


  const consultarAlunosSupabase = async () => {
    setConsultandoAlunos(true)
    setErroConsultaAlunos('')

    try {
      const { data, error } = await supabase
        .from('alunos')
        .select('id, nome, objetivo, peso, altura, whatsapp, observacoes')
        .order('nome', { ascending: true })

      if (error) throw error

      setAlunos((data ?? []) as Aluno[])
      setAlunosRemotos((data ?? []) as Aluno[])
    } catch (erro) {
      console.error('Erro ao consultar alunos:', erro)
      setErroConsultaAlunos(
        'Não foi possível consultar os alunos no Supabase.'
      )
    } finally {
      setConsultandoAlunos(false)
    }
  }




  /* ---------- AÇÕES: alunos ---------- */


  const abrirNovoAluno = () => {
    setAlunoEditando(null)
    setFormAluno({ ...FORM_ALUNO })
    setErroSalvarAluno('')
    setModalAluno(true)
  }

  const editarAluno = (aluno: Aluno) => {
    setAlunoEditando(aluno.id)
    setFormAluno({
      nome: aluno.nome,
      objetivo: aluno.objetivo,
      peso: aluno.peso,
      altura: aluno.altura,
      whatsapp: aluno.whatsapp,
      observacoes: aluno.observacoes,
    })
    setErroSalvarAluno('')
    setModalAluno(true)
  }

  const fecharModalAluno = () => {
    if (salvandoAluno) return
    setModalAluno(false)
    setAlunoEditando(null)
  }



  const salvarAluno = async () => {
    if (!formAluno.nome.trim() || salvandoAluno) return

    setSalvandoAluno(true)
    setErroSalvarAluno('')

    const dados = {
      nome: formAluno.nome.trim(),
      objetivo: formAluno.objetivo,
      peso: formAluno.peso,
      altura: formAluno.altura,
      whatsapp: formAluno.whatsapp,
      observacoes: formAluno.observacoes,
    }

    try {
      const resultado = alunoEditando
        ? await supabase
          .from('alunos')
          .update(dados)
          .eq('id', alunoEditando)
          .select('id')
        : await supabase
          .from('alunos')
          .insert({
            id: crypto.randomUUID(),
            ...dados,
          })
          .select('id')

      if (resultado.error) throw resultado.error

      if (!resultado.data?.length) {
        throw new Error('O Supabase não confirmou o salvamento.')
      }

      await consultarAlunosSupabase()

      setFormAluno({ ...FORM_ALUNO })
      setAlunoEditando(null)
      setModalAluno(false)
    } catch (erro) {
      console.error('Erro ao salvar aluno:', erro)
      setErroSalvarAluno(
        'Não foi possível salvar os dados do aluno.'
      )
    } finally {
      setSalvandoAluno(false)
    }
  }





  const excluirAluno = async (aluno: Aluno) => {
    const confirmou = window.confirm(
      `Excluir o aluno "${aluno.nome}" e todas as suas fichas de treino?\n\nEsta ação não poderá ser desfeita.`
    )

    if (!confirmou) return

    try {
      const { error } = await supabase
        .from('alunos')
        .delete()
        .eq('id', aluno.id)
        .select('id')

      if (error) throw error

      setFichaId(null)
      setFichas(prev =>
        prev.filter(f => f.alunoId !== aluno.id)
      )

      await consultarAlunosSupabase()
    } catch (erro) {
      console.error('Erro ao excluir aluno:', erro)
      window.alert('Não foi possível excluir o aluno.')
    }
  }


  const abrirModalEx = (ex: Exercicio | null) => {
    setFormEx(
      ex
        ? { nome: ex.nome, grupo: ex.grupo, equipamento: ex.equipamento, foco: ex.foco, instrucoes: ex.instrucoes, video_url: ex.video_url ?? '', gif_url: ex.gif_url ?? '' }
        : { ...FORM_EX, grupo: categorias[0] ?? '' }
    )
    setModalEx({ editing: ex })
  }
  const salvarEx = async () => {
    if (!formEx.nome.trim() || !modalEx) return
    const editing = modalEx.editing
    const dados = {
      nome: formEx.nome.trim(), grupo: formEx.grupo || categorias[0], equipamento: formEx.equipamento.trim(),
      foco: formEx.foco.trim(), instrucoes: formEx.instrucoes.trim(),
      video_url: formEx.video_url.trim() || null, gif_url: formEx.gif_url.trim() || null,
    }
    await catalogWrite(async commit => {
      if (!dados.grupo || !categorias.includes(dados.grupo)) throw new Error('Selecione uma categoria válida.')
      if (biblioteca.some(e => e.id !== editing?.id && norm(e.nome) === norm(dados.nome))) throw new Error('Já existe um exercício com esse nome.')
      const query = editing
        ? supabase.from('biblioteca_exercicios').update(dados).eq('id', editing.id)
        : supabase.from('biblioteca_exercicios').insert({ ...dados, id: crypto.randomUUID() })
      const { data, error } = await query.select().single()
      if (error) throw error
      commit(() => {
        setBiblioteca(prev => editing ? prev.map(e => e.id === editing.id ? data as Exercicio : e) : [...prev, data as Exercicio])
        setModalEx(null)
      })
    })
  }
  const excluirEx = async (e: Exercicio) => {
    if (!window.confirm(`Excluir "${e.nome}" da biblioteca?`)) return
    await catalogWrite(async commit => {
      const { error } = await supabase.from('biblioteca_exercicios').delete().eq('id', e.id).select('id').single()
      if (error) throw error
      commit(() => setBiblioteca(prev => prev.filter(x => x.id !== e.id)))
    })
  }
  const criarCategoria = async () => {
    const nome = novaCat.trim()
    if (!nome) return
    await catalogWrite(async commit => {
      if (categorias.some(c => norm(c) === norm(nome))) throw new Error('Já existe uma categoria com esse nome.')
      const { data, error } = await supabase.from('categorias_exercicios').insert({ nome }).select('nome').single()
      if (error) throw error
      commit(() => { setCategorias(prev => [...prev, data.nome]); setNovaCat('') })
    })
  }
  const excluirCategoria = async (categoria: Grupo) => {
    if (biblioteca.some(e => e.grupo === categoria)) {
      window.alert(`A categoria "${categoria}" possui exercícios associados. Mova esses exercícios para outra categoria antes de excluir.`)
      return
    }
    if (!window.confirm(`Excluir a categoria "${categoria}"?`)) return
    await catalogWrite(async commit => {
      const { error } = await supabase.rpc('pgp_delete_category', { p_nome: categoria })
      if (error) throw error
      commit(() => {
        setCategorias(prev => prev.filter(c => c !== categoria))
        setGEx(prev => prev === categoria ? 'Todos' : prev)
      })
    })
  }

  const abrirCriarTemplate = (t?: Template) => {
    setTplId(t ? t.id : null)
    setTplNome(t ? t.nome : '')
    setTplNivel(t ? t.nivel : 'INICIANTE')
    setTplObj(t ? t.objetivo : 'HIPERTROFIA')
    setTplDesc(t ? t.descricao : '')
    setTplExs(t ? clone(t.exercicios) : [])
    setView('criarTemplate')
  }
  const persistTemplate = async (template: Template, editing: boolean, commit: (change: () => void) => void) => {
    if (templates.some(t => t.id !== (editing ? template.id : null) && norm(t.nome) === norm(template.nome))) throw new Error('Já existe um template com esse nome.')
    const saved = await saveRemoteTemplate(template, editing) as Template
    commit(() => setTemplates(prev => editing ? prev.map(t => t.id === saved.id ? saved : t) : [...prev, saved]))
  }
  const salvarTemplate = async () => {
    if (!tplNome.trim() || tplExs.length === 0) return
    const template: Template = { id: tplId || crypto.randomUUID(), nome: tplNome.trim(), nivel: tplNivel, objetivo: tplObj, descricao: tplDesc.trim(), exercicios: clone(tplExs), dataCriacao: templates.find(t => t.id === tplId)?.dataCriacao || hoje() }
    await catalogWrite(async commit => {
      await persistTemplate(template, !!tplId, commit)
      commit(() => { setView('main'); setTab('templates') })
    })
  }
  const duplicarTemplate = async (t: Template) => {
    let nome = t.nome + ' (cópia)', numero = 2
    while (templates.some(item => norm(item.nome) === norm(nome))) nome = `${t.nome} (cópia ${numero++})`
    await catalogWrite(commit => persistTemplate({ ...t, id: crypto.randomUUID(), nome, exercicios: clone(t.exercicios), dataCriacao: hoje() }, false, commit))
  }
  const excluirTemplate = async (t: Template) => {
    if (!window.confirm(`Excluir o template "${t.nome}"?`)) return
    await catalogWrite(async commit => {
      const { error } = await supabase.from('templates').delete().eq('id', t.id).select('id').single()
      if (error) throw error
      commit(() => setTemplates(prev => prev.filter(x => x.id !== t.id)))
    })
  }

  const editarFicha = (plan: Ficha) => {
    setFEditId(plan.id); setFAluno(plan.alunoId); setFNome(plan.nome); setFData(plan.data)
    setFTplId(plan.templateId || '')
    setFDivisoes(plan.divisoes.map(d => ({ ...d, exercicios: clone(d.exercicios) })))
    setFDivisaoId(plan.divisoes[0]?.id || ''); setView('criarFicha')
  }
  const abrirCriarFicha = (alunoId?: string, t?: Template) => {
    if (!workoutReady || workoutBusy) return
    const existing = fichas.find(f => f.alunoId === alunoId)
    if (existing) {
      editarFicha(existing)
      if (t) {
        const division = { ...makeDivision(existing.divisoes), exercicios: clone(t.exercicios) }
        setFDivisoes([...existing.divisoes.map(d => ({ ...d, exercicios: clone(d.exercicios) })), division]); setFDivisaoId(division.id)
      }
      return
    }
    const division = { ...makeDivision([]), exercicios: t ? clone(t.exercicios) : [] }
    setFEditId(null); setFAluno(alunoId || ''); setFNome(t?.nome || ''); setFData(hoje())
    setFTplId(t?.id || ''); setFDivisoes([division]); setFDivisaoId(division.id); setView('criarFicha')
  }
  const selecionarAlunoFicha = (id: string) => {
    const existing = fichas.find(f => f.alunoId === id)
    if (existing) {
      if (window.confirm('Este aluno possui um plano. Abrir o plano existente? As alterações deste rascunho serão descartadas.')) editarFicha(existing)
    } else setFAluno(id)
  }
  const adicionarDivisao = () => {
    const division = makeDivision(fDivisoes)
    setFDivisoes(prev => [...prev, division]); setFDivisaoId(division.id)
  }
  const renomearDivisao = () => {
    if (!fDivisao) return
    const codigo = window.prompt('Código da divisão (A, B, C...)', fDivisao.codigo)
    if (codigo === null) return
    const nome = window.prompt('Nome da divisão', fDivisao.nome)
    if (nome === null || !nome.trim()) return
    try { setFDivisoes(updateDivision(fDivisoes, fDivisao.id, { codigo, nome: nome.trim() })) }
    catch (error) { window.alert(remoteError(error)) }
  }
  const removerDivisaoAtual = () => {
    if (!fDivisao || fDivisoes.length <= 1 || !window.confirm(`Remover a divisão ${fDivisao.codigo} e seus exercícios?`)) return
    const remaining = removeDivision(fDivisoes, fDivisao.id)
    setFDivisoes(remaining); setFDivisaoId(remaining[0].id)
  }
  const carregarTemplate = (id: string) => {
    const t = templates.find(x => x.id === id)
    if (!t || !fDivisao) return
    if (fExs.length && !window.confirm(`Substituir apenas os exercícios da divisão ${fDivisao.codigo} pelo template?`)) return
    setFExs(clone(t.exercicios))
    if (!fNome.trim()) setFNome(t.nome)
  }
  const workoutWrite = async (operation: () => Promise<Ficha | void>) => {
    if (workoutLock.current || !workoutReady) return
    const session = workoutSession.current
    workoutLock.current = true; setWorkoutBusy(true); setWorkoutError('')
    try {
      const saved = await operation()
      if (session !== workoutSession.current) return
      if (saved) {
        setFichas(prev => [...prev.filter(f => f.id !== saved.id), saved])
        setFichaId(saved.id); setView('ficha')
      }
    } catch (error) { if (session === workoutSession.current) window.alert(remoteError(error)) }
    finally { workoutLock.current = false; setWorkoutBusy(false) }
  }
  const salvarFicha = async () => {
    const plan: Ficha = { id: fEditId || crypto.randomUUID(), alunoId: fAluno, nome: fNome.trim(), data: fData || hoje(), templateId: fTplId || undefined, divisoes: fDivisoes.map(d => ({ ...d, exercicios: clone(d.exercicios) })) }
    await workoutWrite(() => saveWorkout(plan, !!fEditId))
  }
  const confirmarAnexo = () => {
    if (!anexar?.alunoId || !anexar.templateId) return
    const t = templates.find(x => x.id === anexar.templateId)
    if (!t) return
    abrirCriarFicha(anexar.alunoId, t); setAnexar(null)
  }
  const excluirFicha = async (f: Ficha) => {
    if (!window.confirm(`Excluir o plano "${f.nome}" e todas as suas divisões?`)) return
    const session = workoutSession.current
    await workoutWrite(async () => {
      await deleteWorkout(f.id)
      if (session !== workoutSession.current) return
      setFichas(prev => prev.filter(x => x.id !== f.id)); setView('main'); setTab('alunos')
    })
  }

  const capturar = async () => {
    if (!fichaRef.current) {
      throw new Error('Ficha não encontrada')
    }

    await document.fonts.ready

    return html2canvas(fichaRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    })
  }
  const exportarPNG = async (nome: string) => {
    if (!fichaRef.current) return
    setExportando(true)
    try {
      const canvas = await capturar()
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `ficha-${slug(nome)}.png`
      a.click()
    } catch (e) {
      window.alert('Não foi possível gerar a imagem. Verifique sua conexão e tente novamente.')
    }
    setExportando(false)
  }
  const exportarPDF = async (nome: string) => {
    if (!fichaRef.current) return
    setExportando(true)
    try {
      const canvas = await capturar()
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pw = 210, ph = 297
      let w = pw
      let h = (canvas.height * pw) / canvas.width
      if (h > ph) { h = ph; w = (canvas.width * ph) / canvas.height }
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, 0, w, h)
      pdf.save(`ficha-${slug(nome)}.pdf`)
    } catch (e) {
      window.alert('Não foi possível gerar o PDF. Verifique sua conexão e tente novamente.')
    }
    setExportando(false)
  }

  const enviarWhats = (f: Ficha, a?: Aluno) => {
    const exercicios = f.divisoes.flatMap(d => [`*${d.codigo} - ${d.nome}*`, ...d.exercicios.map((e, i) => {
      const detalhes = [
        `• Séries: ${e.series}`,
        `• Repetições: ${e.reps}`,
        e.carga ? `• Carga: ${e.carga}` : '',
        e.descanso ? `• Descanso: ${e.descanso}` : '',
      ].filter(Boolean).join('\n')

      return `*${String(i + 1).padStart(2, '0')}. ${e.nome}*\n${detalhes}`
    })])

    const msg = [
      '💪 *POWER GYM PRO*',
      '━━━━━━━━━━━━━━',
      '📋 *FICHA DE TREINO*',
      '',
      `👤 *Aluno:* ${a?.nome ?? 'Aluno'}`,
      a ? `🎯 *Objetivo:* ${a.objetivo}` : '',
      `🏋️ *Treino:* ${f.nome}`,
      '',
      '━━━━━━━━━━━━━━',
      '*EXERCÍCIOS*',
      '',
      exercicios.join('\n\n'),
      '',
      '━━━━━━━━━━━━━━',
      '🔥 *Bons treinos!*',
      'Consistência é a chave dos resultados. 💪',
    ].filter((linha) => linha !== undefined && linha !== null).join('\n')

    const tel = a ? telefone(a.whatsapp) : ''
    window.open(
      `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`,
      '_blank',
      'noopener,noreferrer'
    )
    setMenuWhats(false)
  }



  const compartilharArquivoWhats = async (
    formato: 'png' | 'pdf',
    f: Ficha,
    aluno?: Aluno
  ) => {
    if (!fichaRef.current || exportando) return

    setMenuWhats(false)
    setExportando(true)

    const appNativo = Capacitor.isNativePlatform()

    const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

    const suportaShare = !appNativo && celular &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'

    // No computador, abre uma aba imediatamente
    // para evitar bloqueio de pop-ups após o processamento.
    const abaWhats = !appNativo && !suportaShare
      ? window.open('', '_blank')
      : null

    try {
      const canvas = await capturar()
      const nome = `ficha-${slug(f.nome)}.${formato}`

      let blob: Blob

      if (formato === 'png') {
        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (resultado) => resultado
              ? resolve(resultado)
              : reject(new Error('Falha ao gerar PNG')),
            'image/png'
          )
        })
      } else {

        const pdf = new jsPDF('p', 'mm', 'a4')

        const pw = 210, ph = 297
        let w = pw
        let h = (canvas.height * pw) / canvas.width

        if (h > ph) {
          h = ph
          w = (canvas.width * ph) / canvas.height
        }

        pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          (pw - w) / 2,
          0,
          w,
          h
        )

        blob = pdf.output('blob')
      }


      if (appNativo) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const leitor = new FileReader()

          leitor.onload = () => {
            const resultado = leitor.result

            if (typeof resultado !== 'string') {
              reject(new Error('Falha ao converter arquivo'))
              return
            }

            resolve(resultado.split(',')[1])
          }

          leitor.onerror = () => reject(
            new Error('Falha ao ler arquivo')
          )

          leitor.readAsDataURL(blob)
        })

        const salvo = await Filesystem.writeFile({
          path: nome,
          data: base64,
          directory: Directory.Cache,
        })

        await Share.share({
          title: f.nome,
          files: [salvo.uri],
          dialogTitle: 'Compartilhar ficha de treino',
        })

        return
      }


      const arquivo = new File(
        [blob],
        nome,
        {
          type: formato === 'png'
            ? 'image/png'
            : 'application/pdf'
        }
      )

      if (suportaShare && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({
            files: [arquivo],
            title: f.nome,
          })
          return
        } catch (erro) {
          // Cancelar o compartilhamento não é um erro.
          if (erro instanceof DOMException && erro.name === 'AbortError') {
            return
          }
        }
      }

      // Alternativa: baixar o arquivo.
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = nome
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.setTimeout(() => URL.revokeObjectURL(url), 60000)

      const tel = aluno ? telefone(aluno.whatsapp) : ''
      const destino = `https://wa.me/${tel}`

      if (abaWhats && !abaWhats.closed) {
        abaWhats.location.href = destino
      } else if (!suportaShare) {
        window.alert(
          'Arquivo baixado. Abra a conversa do aluno no WhatsApp e anexe o arquivo manualmente.'
        )
      } else {
        window.alert(
          'Arquivo baixado. Abra o WhatsApp e anexe o arquivo manualmente.'
        )
      }
    } catch (erro) {
      abaWhats?.close()
      console.error('Erro ao preparar arquivo:', erro)
      window.alert('Não foi possível preparar o arquivo.')
    } finally {
      setExportando(false)
    }
  }


  /* ---------- derivados ---------- */
  const alunosFiltrados = alunos.filter((a) => norm(a.nome + ' ' + a.objetivo).includes(norm(qAluno)))
  const templatesFiltrados = templates.filter((t) => norm(t.nome + ' ' + t.objetivo + ' ' + t.nivel).includes(norm(qTemplate)))
  const exFiltrados = biblioteca.filter(
    (e) => (gEx === 'Todos' || e.grupo === gEx) && norm(e.nome + ' ' + e.foco + ' ' + e.equipamento).includes(norm(qEx))
  )
  const fichaAtual = fichas.find((f) => f.id === fichaId)
  const alunoFicha = fichaAtual ? alunos.find((a) => a.id === fichaAtual.alunoId) : undefined

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'exercicios', label: 'EXERCÍCIOS', icon: <Dumbbell size={14} /> },
    { id: 'templates', label: 'TEMPLATES', icon: <Layers size={14} /> },
    { id: 'alunos', label: 'ALUNOS', icon: <Users size={14} /> },
  ]

  /* =======================================================
     RENDER
     ======================================================= */
  return (
    <div className="min-h-screen">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#080808]/80 backdrop-blur-md border-b border-[#1A1A1A]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={() => { setView('main'); setTab('alunos') }}><LogoText size="small" variant="dark" /></button>
          <nav className="flex items-center gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setView('main') }}
                className={`h-9 px-3 sm:px-4 rounded-[10px] text-[11px] font-bold inline-flex items-center gap-1.5 border transition ${tab === t.id ? 'bg-white text-black border-white' : 'bg-[#1A1A1A] border-[#222] text-[#888] hover:text-white'
                  }`}
              >
                {t.icon}<span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
            <button onClick={() => void sair()} title="Sair" className="h-9 w-9 rounded-[10px] bg-[#1A1A1A] border border-[#222] text-[#888] hover:text-white flex items-center justify-center">
              <LogOut size={14} />
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-16">
        {workoutLoading && <p role="status">Carregando planos de treino...</p>}
        {workoutError && <div role="alert" className="mb-4 text-red-400">{workoutError} <button className={btnSec} onClick={() => setWorkoutRetry(n => n + 1)}>Tentar novamente</button></div>}
        {workoutBusy && <p role="status">Salvando plano...</p>}
        {catalogLoading && <p role="status">Carregando biblioteca, categorias e templates...</p>}
        {catalogError && <div role="alert" className="mb-4 text-red-400">{catalogError} <button className={btnSec} onClick={() => setCatalogRetry(n => n + 1)}>Tentar novamente</button></div>}
        {catalogBusy && <p role="status">Salvando alterações...</p>}
        {/* ================= ALUNOS ================= */}
        {view === 'main' && tab === 'alunos' && (
          <div className="space-y-6">


            <div className="rounded-xl border border-[#2A2A2A] bg-[#121212] p-4 space-y-3">
              <div>
                <p className="text-sm font-bold">
                  Teste de conexão Supabase
                </p>
                <p className="text-xs text-[#888]">
                  Consulta somente leitura. Os alunos locais não serão alterados.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void consultarAlunosSupabase()}
                disabled={consultandoAlunos}
                className={btnSec}
              >
                {consultandoAlunos
                  ? 'Consultando...'
                  : 'Consultar alunos no Supabase'}
              </button>

              {erroConsultaAlunos && (
                <p className="text-xs text-red-400">
                  {erroConsultaAlunos}
                </p>
              )}

              {!erroConsultaAlunos && (
                <p className="text-xs text-[#AAA]">
                  Alunos encontrados no Supabase: {alunosRemotos.length}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ['Alunos', alunos.length],
                ['Fichas', fichas.length],
                ['Exercícios', biblioteca.length],
                ['Templates', templates.length],
              ].map(([l, v]) => (
                <div key={l as string} className={cardCls + ' p-5'}>
                  <p className={labelCls + ' mb-2'}>{l}</p>
                  <p className="text-[28px] font-black leading-none">{v}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-[20px] font-extrabold">Meus Alunos</h2>
              <div className="flex gap-2">
                <button onClick={abrirNovoAluno} className={btnSec + ' h-11 flex-1 sm:flex-none'}><UserPlus size={14} />Novo Aluno</button>
                <button disabled={!workoutReady || workoutBusy} onClick={() => abrirCriarFicha()} className={btnPri + ' flex-1 sm:flex-none'}><Plus size={15} />CRIAR PLANO</button>
              </div>
            </div>

            <SearchBox value={qAluno} onChange={setQAluno} placeholder="Buscar aluno por nome ou objetivo..." />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alunosFiltrados.map((a) => {
                const fs = fichas.filter((f) => f.alunoId === a.id)
                return (
                  <div key={a.id} className={cardCls + ' p-5 flex flex-col'}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-white text-black font-black text-[14px] flex items-center justify-center shrink-0">
                        {iniciais(a.nome)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-extrabold truncate">{a.nome}</p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[#888] font-semibold">
                          {a.objetivo}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => editarAluno(a)}
                          title={`Editar ${a.nome}`}
                          aria-label={`Editar aluno ${a.nome}`}
                          className="w-9 h-9 rounded-lg bg-[#1A1A1A] border border-[#333] text-[#CCC] hover:text-white hover:border-[#555] flex items-center justify-center transition"
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => void excluirAluno(a)}
                          title={`Excluir ${a.nome}`}
                          aria-label={`Excluir aluno ${a.nome}`}
                          className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/40 flex items-center justify-center transition"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-[12px] text-[#bbb]">
                      <span className="inline-flex items-center gap-1.5"><Weight size={13} className="text-[#777]" />{a.peso ? a.peso + ' kg' : '—'}</span>
                      <span className="inline-flex items-center gap-1.5"><Ruler size={13} className="text-[#777]" />{a.altura ? a.altura + ' cm' : '—'}</span>
                    </div>
                    {a.observacoes && <p className="text-[12px] italic text-[#888] mt-3">{a.observacoes}</p>}

                    <div className="mt-4 flex-1">
                      <p className={labelCls}>Plano de treino</p>
                      {fs.length === 0 ? (
                        <div className="border border-dashed border-[#2A2A2A] rounded-xl py-4 text-center text-[12px] text-[#666]">Nenhuma ficha criada</div>
                      ) : (
                        <div className="space-y-1.5">
                          {fs.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => { setFichaId(f.id); setView('ficha') }}
                              className="w-full flex items-center gap-2 bg-[#0E0E0E] border border-[#1E1E1E] hover:border-[#333] rounded-[10px] px-3 py-2.5 text-left transition"
                            >
                              <FileText size={14} className="text-[#777] shrink-0" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-[12px] font-semibold truncate">{f.nome}</span>
                                <span className="block text-[10px] text-[#777]">{f.data} • {f.divisoes.reduce((n, d) => n + d.exercicios.length, 0)} exercícios</span>
                                {f.divisoes.map(d => <span key={d.id} className="block text-[11px] text-[#aaa]">{d.codigo} - {d.nome}: {d.exercicios.length} exercícios</span>)}
                              </span>
                              <ChevronRight size={14} className="text-[#555]" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <a href={`https://wa.me/${telefone(a.whatsapp)}`} target="_blank" rel="noreferrer" className={btnSec}><MessageCircle size={13} />WhatsApp</a>
                      <button disabled={!workoutReady || workoutBusy} onClick={() => abrirCriarFicha(a.id)} className={btnSec}><Pencil size={13} />{fs.length ? 'Editar Plano' : 'Novo Plano'}</button>
                      <button onClick={() => setAnexar({ templateId: templates[0]?.id ?? '', alunoId: a.id })} className={btnSec}><Layers size={13} />Template</button>
                    </div>
                  </div>
                )
              })}
              {alunosFiltrados.length === 0 && <p className="text-[13px] text-[#666] col-span-full text-center py-10">Nenhum aluno encontrado.</p>}
            </div>
          </div>
        )}

        {/* ================= TEMPLATES ================= */}
        {view === 'main' && tab === 'templates' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-extrabold">Templates de Fichas</h2>
                <p className="text-[12px] text-[#888] mt-1">Crie modelos prontos e anexe aos alunos na época certa</p>
              </div>
              <button onClick={() => abrirCriarTemplate()} className={btnPri}><Plus size={15} />NOVO TEMPLATE</button>
            </div>
            <SearchBox value={qTemplate} onChange={setQTemplate} placeholder="Buscar template por nome, objetivo ou nível..." />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templatesFiltrados.map((t) => (
                <div key={t.id} className={cardCls + ' p-5 flex flex-col'}>
                  <p className="text-[14px] font-bold">{t.nome}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <span className="px-2 py-0.5 rounded-md bg-white text-black text-[10px] font-bold">{t.objetivo}</span>
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${nivelCls[t.nivel]}`}>{t.nivel}</span>
                  </div>
                  <p className="text-[11px] text-[#888] mt-3 leading-relaxed">{t.descricao}</p>
                  <ul className="mt-3 space-y-1 flex-1">
                    {t.exercicios.slice(0, 3).map((e) => (
                      <li key={e.id} className="text-[11px] text-[#bbb] truncate">• {e.nome} <span className="text-[#666]">{e.series}x{e.reps}</span></li>
                    ))}
                    {t.exercicios.length > 3 && <li className="text-[11px] text-[#666]">+ {t.exercicios.length - 3} exercícios</li>}
                  </ul>
                  <p className={labelCls + ' mt-3 mb-0'}>{t.exercicios.length} exercícios</p>
                  <button onClick={() => setAnexar({ templateId: t.id, alunoId: alunos[0]?.id ?? '' })} className={btnPri + ' w-full mt-3'}><Paperclip size={14} />Anexar ao Aluno</button>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <button disabled={!workoutReady || workoutBusy} onClick={() => abrirCriarFicha(undefined, t)} className={btnSec + ' px-0'} title="Usar em novo plano"><ClipboardCopy size={13} /></button>
                    <button onClick={() => abrirCriarTemplate(t)} className={btnSec + ' px-0'} title="Editar"><Pencil size={13} /></button>
                    <button onClick={() => duplicarTemplate(t)} className={btnSec + ' px-0'} title="Duplicar"><Copy size={13} /></button>
                    <button onClick={() => excluirTemplate(t)} className={btnSec + ' px-0 text-red-400'} title="Excluir"><Trash2 size={13} /></button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-1 text-[9px] uppercase tracking-[0.08em] text-[#666] text-center font-semibold">
                    <span>Usar</span><span>Editar</span><span>Duplicar</span><span>Excluir</span>
                  </div>
                </div>
              ))}
              {templatesFiltrados.length === 0 && <p className="text-[13px] text-[#666] col-span-full text-center py-10">Nenhum template encontrado.</p>}
            </div>
          </div>
        )}

        {/* ================= EXERCÍCIOS ================= */}
        {view === 'main' && tab === 'exercicios' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-extrabold">Biblioteca de Exercícios</h2>

                <p className="text-[12px] text-[#888] mt-1">{biblioteca.length} exercícios • {categorias.length} categorias</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModalCat(true)} className={btnSec + ' h-11 flex-1 sm:flex-none'}><FolderPlus size={14} />NOVA CATEGORIA</button>
                <button onClick={() => abrirModalEx(null)} className={btnPri + ' flex-1 sm:flex-none'}><Plus size={15} />NOVO EXERCÍCIO</button>
              </div>
            </div>
            <SearchBox value={qEx} onChange={setQEx} placeholder="Buscar por nome, foco ou equipamento..." />
            <Chips options={['Todos', ...categorias]} value={gEx} onChange={setGEx} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {exFiltrados.map((e) => (
                <div key={e.id} className={cardCls + ' p-4 flex flex-col'}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-bold leading-snug">{e.nome}</p>
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-white text-black text-[10px] font-bold">{e.grupo}</span>
                  </div>
                  <p className="text-[11px] text-[#999] mt-2"><span className="text-[#666]">Equipamento:</span> {e.equipamento || '—'}</p>
                  <p className="text-[11px] text-[#999] mt-0.5"><span className="text-[#666]">Foco:</span> {e.foco || '—'}</p>
                  <p className="text-[11px] text-[#777] mt-2 line-clamp-2 flex-1">{e.instrucoes}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#666] font-semibold mt-3">
                    Vídeo: {e.video_url ? 'Configurado' : 'Em branco (null)'}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <button onClick={() => setExDetalhe(e)} className={btnSec}><Play size={12} />Ver</button>
                    <button onClick={() => abrirModalEx(e)} className={btnSec}><Pencil size={12} />Editar</button>
                    <button onClick={() => excluirEx(e)} className={btnSec + ' text-red-400'}><Trash2 size={12} />Excluir</button>
                  </div>
                </div>
              ))}
              {exFiltrados.length === 0 && <p className="text-[13px] text-[#666] col-span-full text-center py-10">Nenhum exercício encontrado.</p>}
            </div>
          </div>
        )}

        {/* ================= CRIAR TEMPLATE ================= */}
        {view === 'criarTemplate' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => { setView('main'); setTab('templates') }} className={btnSec}><ChevronLeft size={14} />Voltar</button>
              <h2 className="text-[16px] font-extrabold">{tplId ? 'Editar Template' : 'Novo Template'}</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[42%_minmax(0,1fr)] gap-4 items-start">
              <Biblioteca
                biblioteca={biblioteca} categorias={categorias} ids={tplExs.map((e) => e.id)}
                onAdd={(e) => setTplExs([...tplExs, { ...e, series: '3', reps: '10-12', carga: '', descanso: '60s' }])}
                onRemove={(id) => setTplExs(tplExs.filter((e) => e.id !== id))}
              />
              <div className={cardCls + ' p-4 space-y-4'}>
                <Field label="Nome do template *">
                  <input className={inputCls} value={tplNome} onChange={(e) => setTplNome(e.target.value)} placeholder="Ex: Hipertrofia ABC" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nível">
                    <select className={inputCls} value={tplNivel} onChange={(e) => setTplNivel(e.target.value as Nivel)}>
                      {NIVEIS.map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="Objetivo">
                    <select className={inputCls} value={tplObj} onChange={(e) => setTplObj(e.target.value as Objetivo)}>
                      {OBJETIVOS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Descrição">
                  <textarea className={textareaCls} rows={2} value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} placeholder="Para quem é esse template?" />
                </Field>
                <div>
                  <p className={labelCls}>Exercícios ({tplExs.length})</p>
                  <ListaEditor lista={tplExs} setLista={setTplExs} />
                </div>
                <button onClick={salvarTemplate} disabled={!catalogReady || catalogBusy || !tplNome.trim() || tplExs.length === 0} className={btnPri + ' w-full'}><Save size={14} />SALVAR TEMPLATE</button>
              </div>
            </div>
          </div>
        )}

        {/* ================= CRIAR FICHA ================= */}
        {view === 'criarFicha' && (
          <fieldset disabled={workoutBusy} className="space-y-4 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => { setView('main'); setTab('alunos') }} className={btnSec}><ChevronLeft size={14} />Voltar</button>
              <h2 className="text-[16px] font-extrabold">{fEditId ? 'Editar Plano' : 'Novo Plano'}</h2>
            </div>
            <div className={cardCls + ' p-3 space-y-3'}>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Divisões do plano">
                {fDivisoes.map(d => <button type="button" key={d.id} aria-pressed={d.id === fDivisaoId} onClick={() => setFDivisaoId(d.id)} className={d.id === fDivisaoId ? btnPri : btnSec}>{d.codigo} - {d.nome}</button>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={adicionarDivisao} className={btnSec}><Plus size={13} />Adicionar divisão</button>
                <button type="button" onClick={renomearDivisao} className={btnSec}><Pencil size={13} />Renomear</button>
                <button type="button" disabled={fDivisoes.length <= 1} onClick={removerDivisaoAtual} className={btnSec}><Trash2 size={13} />Remover divisão</button>
              </div>
              <p className="text-[12px] text-[#aaa]">Editando {fDivisao?.codigo} - {fDivisao?.nome}. As outras divisões serão preservadas.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[42%_minmax(0,1fr)] gap-4 items-start">
              <Biblioteca
                biblioteca={biblioteca} categorias={categorias} ids={fExs.map((e) => e.id)}
                onAdd={(e) => setFExs([...fExs, { ...e, series: '3', reps: '10-12', carga: '', descanso: '60s' }])}
                onRemove={(id) => setFExs(fExs.filter((e) => e.id !== id))}
              />
              <div className={cardCls + ' p-4 space-y-4'}>
                <Field label="Aluno *">
                  <select className={inputCls} disabled={!!fEditId} value={fAluno} onChange={(e) => selecionarAlunoFicha(e.target.value)}>
                    <option value="">Selecione o aluno</option>
                    {alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </Field>
                <Field label="Nome do plano *">
                  <input className={inputCls} value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Ex: Plano de hipertrofia" />
                </Field>
                <Field label="Aplicar template apenas na divisão selecionada">
                  <select className={inputCls} value="" onChange={(e) => carregarTemplate(e.target.value)}>
                    <option value="">Selecione um template</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </Field>
                <div>
                  <p className={labelCls}>Exercícios ({fExs.length})</p>
                  <ListaEditor lista={fExs} setLista={setFExs} />
                </div>
                <button onClick={salvarFicha} disabled={!workoutReady || workoutBusy || !fAluno || !fNome.trim() || !fDivisoes.length} className={btnPri + ' w-full'}><Save size={14} />SALVAR PLANO</button>
              </div>
            </div>
          </fieldset>
        )}

        {/* ================= FICHA DETALHE ================= */}
        {view === 'ficha' && fichaAtual && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { setView('main'); setTab('alunos') }} className={btnSec}><ChevronLeft size={14} />Voltar</button>
              <div className="flex-1" />
              <button disabled={exportando} onClick={() => exportarPNG(fichaAtual.nome)} className={btnSec}><ImageIcon size={13} />Imagem</button>
              <button disabled={exportando} onClick={() => exportarPDF(fichaAtual.nome)} className={btnSec}><FileText size={13} />PDF</button>

              <div className="relative">
                <button
                  disabled={exportando}
                  onClick={() => setMenuWhats(!menuWhats)}
                  className={
                    btnSec +
                    ' !bg-green-600/20 !border-green-600/40 text-green-400'
                  }
                >
                  <MessageCircle size={13} />
                  WhatsApp
                  <ChevronDown size={12} />
                </button>

                {menuWhats && (
                  <>
                    <button
                      type="button"
                      aria-label="Fechar menu"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setMenuWhats(false)}
                    />


                    <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-52 max-w-[calc(100vw-2rem)] bg-[#1A1A1A] border border-[#333] rounded-xl shadow-2xl z-50 p-1.5">

                      <button
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#292929] text-left text-sm"
                        onClick={() => enviarWhats(fichaAtual, alunoFicha)}
                      >
                        <MessageCircle size={16} className="text-green-400" />
                        Enviar texto
                      </button>

                      <button
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#292929] text-left text-sm"
                        onClick={() =>
                          compartilharArquivoWhats('png', fichaAtual, alunoFicha)
                        }
                      >
                        <ImageIcon size={16} className="text-blue-400" />
                        Enviar imagem
                      </button>

                      <button
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#292929] text-left text-sm"
                        onClick={() =>
                          compartilharArquivoWhats('pdf', fichaAtual, alunoFicha)
                        }
                      >
                        <FileText size={16} className="text-red-400" />
                        Enviar PDF
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button disabled={workoutBusy} onClick={() => editarFicha(fichaAtual)} className={btnSec}><Pencil size={13} />Editar plano</button>
              <button disabled={workoutBusy} onClick={() => excluirFicha(fichaAtual)} className={btnSec + ' text-red-400'}><Trash2 size={13} /></button>
            </div>
            {exportando && <p className="text-[11px] text-[#888]">Gerando arquivo...</p>}

            <div ref={fichaRef} id="ficha-para-exportar" className="bg-white text-black rounded-2xl overflow-hidden">
              <div className="bg-black px-5 py-5 flex items-center justify-between">
                <LogoText size="default" variant="dark" />
                <p className="text-[11px] text-white/70 font-medium">{fichaAtual.data}</p>
              </div>
              <div className="px-5 pt-5 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[22px] font-extrabold leading-tight">{alunoFicha?.nome ?? 'Aluno removido'}</h2>
                  {alunoFicha && <span className="px-2 py-0.5 rounded-md bg-black text-white text-[10px] font-bold">{alunoFicha.objetivo}</span>}
                </div>
                {alunoFicha && (
                  <p className="text-[12px] text-neutral-600 mt-1.5">
                    {alunoFicha.peso ? alunoFicha.peso + ' kg' : '—'} • {alunoFicha.altura ? alunoFicha.altura + ' cm' : '—'}
                  </p>
                )}
                <p className="text-[13px] font-bold mt-2 uppercase tracking-wide">{fichaAtual.nome}</p>
              </div>
              <div className="px-3 pb-5">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 text-[10px] uppercase tracking-[0.1em] text-neutral-600">
                      <th className="px-3 py-2.5 font-bold">Exercício</th>
                      <th className="px-2 py-2.5 font-bold text-center">Séries x Reps</th>
                      <th className="px-2 py-2.5 font-bold text-center">Carga</th>
                      <th className="px-2 py-2.5 font-bold text-center">Descanso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fichaAtual.divisoes.map(d => <Fragment key={d.id}>
                      <tr className="bg-neutral-100"><th colSpan={4} className="px-3 py-3 text-[13px]">{d.codigo} - {d.nome}</th></tr>
                      {d.exercicios.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-[12px]">Nenhum exercício nesta divisão.</td></tr>}
                      {d.exercicios.map((e, i) => (
                      <tr key={e.id + i} className="border-b border-neutral-200">
                        <td className="px-3 py-3 align-top">
                          <button onClick={() => setExDetalhe(e)} className="text-left text-[13px] font-bold hover:underline">
                            {i + 1}. {e.nome}
                          </button>
                          <p className="text-[10px] text-neutral-500 mt-0.5">{e.grupo}</p>
                        </td>
                        <td className="px-2 py-3 text-center text-[12px] font-semibold align-top whitespace-nowrap">{e.series} x {e.reps}</td>
                        <td className="px-2 py-3 text-center text-[12px] align-top">{e.carga || '—'}</td>
                        <td className="px-2 py-3 text-center text-[12px] align-top whitespace-nowrap">{e.descanso || '—'}</td>
                      </tr>
                    ))}
                    </Fragment>)}
                  </tbody>
                </table>
                <p className="text-center text-[10px] text-neutral-400 mt-4 uppercase tracking-[0.15em]">Treino profissional. Resultados reais.</p>
              </div>
            </div>
          </div>
        )}
        {view === 'ficha' && !fichaAtual && (
          <div className="text-center py-20 text-[13px] text-[#888]">
            Ficha não encontrada.
            <div className="mt-4"><button onClick={() => { setView('main'); setTab('alunos') }} className={btnSec}>Voltar</button></div>
          </div>
        )}
      </main>

      {/* ================= MODAL NOVO ALUNO ================= */}
      {modalAluno && (
        <Modal
          title={alunoEditando ? 'Editar Aluno' : 'Novo Aluno'}
          onClose={fecharModalAluno}
        >
          <div className="space-y-4">
            <Field label="Nome *">
              <input className={inputCls} value={formAluno.nome} onChange={(e) => setFormAluno({ ...formAluno, nome: e.target.value })} placeholder="Nome completo" />
            </Field>
            <Field label="Objetivo">
              <select className={inputCls} value={formAluno.objetivo} onChange={(e) => setFormAluno({ ...formAluno, objetivo: e.target.value as Objetivo })}>
                {OBJETIVOS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="WhatsApp">
              <input className={inputCls} inputMode="tel" value={formAluno.whatsapp} onChange={(e) => setFormAluno({ ...formAluno, whatsapp: e.target.value })} placeholder="(11) 99999-9999" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Peso (kg)">
                <input className={inputCls} inputMode="decimal" value={formAluno.peso} onChange={(e) => setFormAluno({ ...formAluno, peso: e.target.value })} placeholder="78" />
              </Field>
              <Field label="Altura (cm)">
                <input className={inputCls} inputMode="numeric" value={formAluno.altura} onChange={(e) => setFormAluno({ ...formAluno, altura: e.target.value })} placeholder="178" />
              </Field>
            </div>
            <Field label="Observações">
              <textarea className={textareaCls} rows={3} value={formAluno.observacoes} onChange={(e) => setFormAluno({ ...formAluno, observacoes: e.target.value })} placeholder="Lesões, restrições, preferências..." />
            </Field>

            {erroSalvarAluno && (
              <p className="text-[12px] text-red-400">
                {erroSalvarAluno}
              </p>
            )}

            <button
              onClick={() => void salvarAluno()}
              disabled={!formAluno.nome.trim() || salvandoAluno}
              className={btnPri + ' w-full'}
            >
              {salvandoAluno
                ? 'SALVANDO...'
                : alunoEditando
                  ? 'SALVAR ALTERAÇÕES'
                  : 'SALVAR ALUNO'}
            </button>

          </div>
        </Modal>
      )}

      {/* ================= MODAL ANEXAR TEMPLATE ================= */}
      {anexar && (
        <Modal title="Anexar Template ao Aluno" onClose={() => setAnexar(null)}>
          <div className="space-y-4">
            <Field label="Aluno">
              <select className={inputCls} value={anexar.alunoId} onChange={(e) => setAnexar({ ...anexar, alunoId: e.target.value })}>
                <option value="">Selecione o aluno</option>
                {alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </Field>
            <Field label="Template">
              <select className={inputCls} value={anexar.templateId} onChange={(e) => setAnexar({ ...anexar, templateId: e.target.value })}>
                <option value="">Selecione o template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Field>
            {(() => {
              const t = templates.find((x) => x.id === anexar.templateId)
              return t ? (
                <div className="bg-[#0E0E0E] border border-[#1E1E1E] rounded-xl p-3">
                  <p className="text-[12px] font-bold">{t.nome}</p>
                  <p className="text-[11px] text-[#888] mt-1">{t.exercicios.length} exercícios • {t.objetivo} • {t.nivel}</p>
                </div>
              ) : null
            })()}
            <button onClick={confirmarAnexo} disabled={!workoutReady || workoutBusy || !anexar.alunoId || !anexar.templateId} className={btnPri + ' w-full'}><Paperclip size={14} />ANEXAR AO ALUNO</button>
          </div>
        </Modal>
      )}

      {/* ================= MODAL NOVO/EDITAR EXERCÍCIO ================= */}
      {modalEx && (
        <Modal title={modalEx.editing ? 'Editar Exercício' : 'Novo Exercício'} onClose={() => setModalEx(null)}>
          <div className="space-y-4">
            <Field label="Nome *">
              <input className={inputCls} value={formEx.nome} onChange={(e) => setFormEx({ ...formEx, nome: e.target.value })} placeholder="Ex: Supino Reto Barra" />
            </Field>
            <Field label="Categoria / Grupo">
              <select className={inputCls} value={formEx.grupo} onChange={(e) => setFormEx({ ...formEx, grupo: e.target.value })}>
                {categorias.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Equipamento">
                <input className={inputCls} value={formEx.equipamento} onChange={(e) => setFormEx({ ...formEx, equipamento: e.target.value })} placeholder="Barra, halteres..." />
              </Field>
              <Field label="Músculo foco">
                <input className={inputCls} value={formEx.foco} onChange={(e) => setFormEx({ ...formEx, foco: e.target.value })} placeholder="Peitoral maior..." />
              </Field>
            </div>
            <Field label="Instruções">
              <textarea className={textareaCls} rows={4} value={formEx.instrucoes} onChange={(e) => setFormEx({ ...formEx, instrucoes: e.target.value })} placeholder="Como executar o movimento..." />
            </Field>
            <Field label="Video URL">
              <input className={inputCls} value={formEx.video_url} onChange={(e) => setFormEx({ ...formEx, video_url: e.target.value })} placeholder="Deixe em branco" />
            </Field>
            <Field label="GIF URL">
              <input className={inputCls} value={formEx.gif_url} onChange={(e) => setFormEx({ ...formEx, gif_url: e.target.value })} placeholder="Deixe em branco" />
            </Field>
            <button onClick={salvarEx} disabled={!catalogReady || catalogBusy || !formEx.nome.trim()} className={btnPri + ' w-full'}>{modalEx.editing ? 'SALVAR ALTERAÇÕES' : 'CRIAR EXERCÍCIO'}</button>
          </div>
        </Modal>
      )}

      {/* ================= MODAL NOVA CATEGORIA ================= */}
      {modalCat && (
        <Modal title="Nova Categoria" onClose={() => setModalCat(false)}>
          <div className="space-y-4">
            <Field label="Nome da categoria">
              <input
                className={inputCls} value={novaCat} onChange={(e) => setNovaCat(e.target.value)} placeholder="Ex: Mobilidade"
                onKeyDown={(e) => e.key === 'Enter' && criarCategoria()}
              />
            </Field>
            <div>
              <p className={labelCls}>Categorias atuais</p>
              <div className="flex flex-wrap gap-1.5">

                {categorias.map((c) => (
                  <div
                    key={c}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#1A1A1A] border border-[#222]"
                  >
                    <span className="text-[11px] font-semibold">
                      {c}
                    </span>

                    <button
                      type="button"
                      disabled={!catalogReady || catalogBusy}
                      onClick={() => excluirCategoria(c)}
                      title={`Excluir categoria ${c}`}
                      aria-label={`Excluir categoria ${c}`}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}

              </div>
            </div>
            <button onClick={criarCategoria} disabled={!catalogReady || catalogBusy || !novaCat.trim()} className={btnPri + ' w-full'}>CRIAR CATEGORIA</button>
          </div>
        </Modal>
      )}

      {/* ================= MODAL EXERCÍCIO DETALHE ================= */}
      {exDetalhe && (
        <Overlay onClose={() => setExDetalhe(null)}>
          <div className="relative aspect-video bg-black flex flex-col items-center justify-center gap-2 rounded-t-2xl">
            <button onClick={() => setExDetalhe(null)} className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-[#1A1A1A] border border-[#222] flex items-center justify-center text-[#888] hover:text-white">
              <X size={15} />
            </button>
            <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center"><Play size={22} /></div>
            <p className="text-[11px] text-[#888] px-6 text-center">
              {exDetalhe.video_url ? 'Vídeo configurado: ' + exDetalhe.video_url : 'Vídeo em breve - Adicione seu asset em video_url'}
            </p>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[16px] font-extrabold leading-snug">{exDetalhe.nome}</h3>
              <span className="shrink-0 px-2 py-0.5 rounded-md bg-white text-black text-[10px] font-bold">{exDetalhe.grupo}</span>
            </div>
            <div>
              <p className={labelCls}>Foco</p>
              <p className="text-[13px] text-[#ddd]">{exDetalhe.foco || '—'}</p>
            </div>
            <div>
              <p className={labelCls}>Instruções</p>
              <p className="text-[13px] text-[#bbb] leading-relaxed">{exDetalhe.instrucoes || '—'}</p>
            </div>
            <div>
              <p className={labelCls}>Equipamento</p>
              <p className="text-[13px] text-[#ddd]">{exDetalhe.equipamento || '—'}</p>
            </div>
            {!exDetalhe.video_url && <p className="text-[11px] text-[#666] italic">Nota: video_url está vazio (null).</p>}
          </div>
        </Overlay>
      )}
    </div>
  )
}
