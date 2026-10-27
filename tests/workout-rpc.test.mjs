// Set PGLITE_MODULE_PATH to an external @electric-sql/pglite installation.
// All fixtures and writes are isolated from the remote Supabase project.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

test('workout RPC validates ownership and atomically persists the complete hierarchy', { skip: !process.env.PGLITE_MODULE_PATH }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.uid'',true),'''')::uuid';
      CREATE FUNCTION public.funcionario_ativo() RETURNS boolean LANGUAGE sql AS 'SELECT coalesce(current_setting(''test.active'',true),'''') = ''true''';
      CREATE TABLE public.alunos(id text PRIMARY KEY);
      CREATE TABLE public.fichas(id text PRIMARY KEY,aluno_id text NOT NULL UNIQUE REFERENCES public.alunos(id) ON DELETE CASCADE,nome text NOT NULL,data text NOT NULL DEFAULT '',template_id text,criado_em timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.divisoes_treino(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ficha_id text NOT NULL REFERENCES public.fichas(id) ON DELETE CASCADE,codigo text NOT NULL,nome text NOT NULL DEFAULT '',ordem integer NOT NULL DEFAULT 0,UNIQUE(ficha_id,codigo));
      CREATE TABLE public.exercicios_treino(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),divisao_id uuid NOT NULL REFERENCES public.divisoes_treino(id) ON DELETE CASCADE,exercicio_id text,nome text NOT NULL,grupo text NOT NULL DEFAULT '',foco text NOT NULL DEFAULT '',instrucoes text NOT NULL DEFAULT '',video_url text,gif_url text,equipamento text NOT NULL DEFAULT '',series text NOT NULL DEFAULT '',reps text NOT NULL DEFAULT '',carga text NOT NULL DEFAULT '',descanso text NOT NULL DEFAULT '',ordem integer NOT NULL DEFAULT 0);
      GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      ALTER TABLE public.fichas ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.divisoes_treino ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.exercicios_treino ENABLE ROW LEVEL SECURITY;
      CREATE POLICY active ON public.fichas TO authenticated USING ((SELECT public.funcionario_ativo())) WITH CHECK ((SELECT public.funcionario_ativo()));
      CREATE POLICY active ON public.divisoes_treino TO authenticated USING ((SELECT public.funcionario_ativo())) WITH CHECK ((SELECT public.funcionario_ativo()));
      CREATE POLICY active ON public.exercicios_treino TO authenticated USING ((SELECT public.funcionario_ativo())) WITH CHECK ((SELECT public.funcionario_ativo()));
      INSERT INTO public.alunos VALUES ('a1'),('a2'),('a3');
    `)
    const migration = fs.readFileSync(new URL('../supabase/migrations/202610270002_workout_rpc.sql', import.meta.url), 'utf8')
    await db.exec(migration); await db.exec(migration)
    const ex = { exercicio_id: 'ex1', nome: 'Supino', grupo: 'Peito', foco: 'Peitoral', instrucoes: 'Executar', video_url: null, gif_url: 'https://example.com/ex.gif', equipamento: 'Barra', series: '3', reps: '10', carga: '20', descanso: '60s' }
    const d1 = { id: '00000000-0000-0000-0000-000000000011', codigo: 'A', nome: 'Peito', exercicios: [ex, { ...ex, exercicio_id: null, nome: 'Remada' }] }
    const d2 = { id: '00000000-0000-0000-0000-000000000012', codigo: 'B', nome: 'Costas', exercicios: [] }
    const f = { id: 'f1', aluno_id: 'a1', nome: 'Plano ABC', data: '2026-10-27', template_id: null }
    const save = async (plan = f, divisions = [d1, d2], edit = false) => (await db.query('SELECT public.pgp_save_workout($1::jsonb,$2::jsonb,$3) AS result', [JSON.stringify(plan), JSON.stringify(divisions), edit])).rows[0].result
    const current = async () => (await db.query("SELECT nome,aluno_id,criado_em FROM public.fichas WHERE id='f1'")).rows[0]
    await db.exec('SET ROLE anon')
    await assert.rejects(save(), /permission denied/)
    await db.exec("SET ROLE authenticated; SET test.uid = ''; SET test.active = 'true'")
    await assert.rejects(save(), /ativo autenticado/)
    await db.exec("SET test.uid = '00000000-0000-0000-0000-000000000001'; SET test.active = 'false'")
    await assert.rejects(save(), /ativo autenticado/)
    await db.exec("SET test.active = 'true'")
    await assert.rejects(save(f, []), /pelo menos/)
    await assert.rejects(save(f, [d1, { ...d2, codigo: ' a ' }]), /duplicado/)
    await assert.rejects(save(f, [{ ...d1, exercicios: [{ ...ex, reps: 12 }] }]), /Campo de exercício/)
    const created = await save()
    assert.deepEqual(created.divisoes_treino.map(d => [d.id, d.codigo, d.ordem]), [[d1.id, 'A', 0], [d2.id, 'B', 1]])
    assert.deepEqual(created.divisoes_treino[0].exercicios_treino.map(e => e.ordem), [0, 1])
    assert.equal(created.divisoes_treino[0].exercicios_treino[1].exercicio_id, null)
    const createdAt = (await current()).criado_em
    await assert.rejects(save({ ...f, id: 'duplicate' }, [{ ...d1, id: '00000000-0000-0000-0000-000000000099' }]), /unique constraint/)
    await assert.rejects(save({ ...f, aluno_id: 'a2' }, [d1], true), /transferir/)
    await assert.rejects(save({ ...f, id: 'missing' }, [d1], true), /encontrado/)
    const otherDivision = { ...d1, id: '00000000-0000-0000-0000-000000000021' }
    await save({ ...f, id: 'f2', aluno_id: 'a2' }, [otherDivision])
    await assert.rejects(save(f, [otherDivision], true), /outro plano/)
    const edited = await save({ ...f, nome: 'Editado' }, [{ ...d2, codigo: 'A', exercicios: [ex] }, { ...d1, codigo: 'B', exercicios: [{ ...ex, carga: '40' }] }], true)
    assert.deepEqual(edited.divisoes_treino.map(d => d.id), [d2.id, d1.id])
    assert.equal(edited.divisoes_treino[1].exercicios_treino[0].carga, '40')
    assert.deepEqual((await current()).criado_em, createdAt)
    await db.exec("RESET ROLE; ALTER TABLE public.exercicios_treino ADD CONSTRAINT reject_child CHECK(nome <> 'FAIL'); SET ROLE authenticated")
    const beforeFailure = await db.query('SELECT * FROM public.exercicios_treino ORDER BY id')
    const divisionsBeforeFailure = await db.query('SELECT * FROM public.divisoes_treino ORDER BY id')
    await assert.rejects(save({ ...f, nome: 'Must roll back' }, [{ ...d2, nome: 'Changed', exercicios: [ex] }, { ...d1, exercicios: [{ ...ex, nome: 'FAIL' }] }], true), /reject_child/)
    assert.equal((await current()).nome, 'Editado')
    assert.deepEqual((await db.query('SELECT * FROM public.exercicios_treino ORDER BY id')).rows, beforeFailure.rows)
    assert.deepEqual((await db.query('SELECT * FROM public.divisoes_treino ORDER BY id')).rows, divisionsBeforeFailure.rows)
    await assert.rejects(save({ ...f, id: 'bad', aluno_id: 'a3' }, [{ ...d1, id: '00000000-0000-0000-0000-000000000031', exercicios: [{ ...ex, nome: 'FAIL' }] }]), /reject_child/)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.fichas WHERE id='bad'")).rows[0].n, 0)
    const single = await save(f, [{ ...d1, exercicios: [] }], true)
    assert.equal(single.divisoes_treino.length, 1)
    assert.equal(single.divisoes_treino[0].id, d1.id)
    assert.equal(single.divisoes_treino[0].exercicios_treino.length, 0)
    await db.exec("DELETE FROM public.fichas WHERE id='f2'")
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.divisoes_treino WHERE ficha_id='f2'")).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.exercicios_treino')).rows[0].n, 0)
  } finally { await db.close() }
})
