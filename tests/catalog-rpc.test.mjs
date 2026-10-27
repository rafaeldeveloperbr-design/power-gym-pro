// Optional isolated PostgreSQL test. Set PGLITE_MODULE_PATH to an external
// installation of @electric-sql/pglite; no production database is accessed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

test('RPC authorization, validation, atomic create/update, rollback and category guard', { skip: !process.env.PGLITE_MODULE_PATH }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        'SELECT nullif(current_setting(''test.uid'',true),'''')::uuid';
      CREATE FUNCTION public.funcionario_ativo() RETURNS boolean LANGUAGE sql AS
        'SELECT coalesce(current_setting(''test.active'',true),'''') = ''true''';
      CREATE TABLE public.templates(id text PRIMARY KEY,nome text NOT NULL,objetivo text NOT NULL,nivel text NOT NULL,descricao text NOT NULL DEFAULT '',data_criacao text NOT NULL DEFAULT '');
      CREATE TABLE public.template_exercicios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id text NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,exercicio_id text,nome text NOT NULL,grupo text NOT NULL DEFAULT '',foco text NOT NULL DEFAULT '',instrucoes text NOT NULL DEFAULT '',video_url text,gif_url text,equipamento text NOT NULL DEFAULT '',series text NOT NULL DEFAULT '',reps text NOT NULL DEFAULT '',carga text NOT NULL DEFAULT '',descanso text NOT NULL DEFAULT '',ordem integer NOT NULL DEFAULT 0);
      CREATE TABLE public.categorias_exercicios(nome text PRIMARY KEY);
      CREATE TABLE public.biblioteca_exercicios(id text PRIMARY KEY,grupo text NOT NULL,nome text NOT NULL DEFAULT 'Exercício');
      GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.template_exercicios ENABLE ROW LEVEL SECURITY;
      CREATE POLICY active ON public.templates TO authenticated USING ((SELECT public.funcionario_ativo())) WITH CHECK ((SELECT public.funcionario_ativo()));
      CREATE POLICY active ON public.template_exercicios TO authenticated USING ((SELECT public.funcionario_ativo())) WITH CHECK ((SELECT public.funcionario_ativo()));
    `)
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/202610270001_catalog_rpc.sql', import.meta.url), 'utf8'))
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/202610270001_catalog_rpc.sql', import.meta.url), 'utf8'))
    const template = { id: 't1', nome: 'Treino', objetivo: 'HIPERTROFIA', nivel: 'INICIANTE', descricao: '', data_criacao: '2026-10-27' }
    const exercise = { exercicio_id: 'ex1', nome: 'Supino', grupo: 'Peito', foco: '', instrucoes: '', video_url: null, gif_url: null, equipamento: '', series: '3', reps: '10', carga: '', descanso: '60s' }
    const save = (t = template, exercises = [exercise], edit = false) => db.query('SELECT public.pgp_save_template($1::jsonb,$2::jsonb,$3) AS result', [JSON.stringify(t), JSON.stringify(exercises), edit])
    await db.exec('SET ROLE anon')
    await assert.rejects(save(), /permission denied/)
    await db.exec("SET ROLE authenticated; SET test.uid = '00000000-0000-0000-0000-000000000001'; SET test.active = 'false'")
    await assert.rejects(save(), /ativo autenticado/)
    await db.exec("SET test.active = 'true'")
    await db.exec("SET test.uid = ''")
    await assert.rejects(save(), /ativo autenticado/)
    await db.exec("SET test.uid = '00000000-0000-0000-0000-000000000001'")
    await assert.rejects(save(template, []), /Preencha/)
    await assert.rejects(save(template, [{ ...exercise, series: 3 }]), /Campo de exercício/)
    await assert.rejects(save({ ...template, nivel: 'INVALID' }), /Preencha/)
    const created = (await save()).rows[0].result
    assert.equal(created.template_exercicios.length, 1)
    await assert.rejects(save({ ...template, id: 't2', nome: ' treino ' }), /existe/)
    const updated = (await save({ ...template, nome: 'Editado' }, [exercise, { ...exercise, exercicio_id: 'ex2', nome: 'Remada' }], true)).rows[0].result
    assert.deepEqual(updated.template_exercicios.map(e => e.ordem), [0, 1])
    assert.equal(updated.template_exercicios.length, 2)
    assert.equal(updated.template_exercicios[1].nome, 'Remada')
    await db.exec("RESET ROLE; ALTER TABLE public.template_exercicios ADD CONSTRAINT reject_child CHECK (nome <> 'FAIL'); SET ROLE authenticated")
    await assert.rejects(save({ ...template, id: 'bad' }, [{ ...exercise, nome: 'FAIL' }]), /reject_child/)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.templates WHERE id='bad'")).rows[0].n, 0)
    await assert.rejects(save({ ...template, nome: 'Must roll back' }, [{ ...exercise, nome: 'FAIL' }], true), /reject_child/)
    assert.equal((await db.query("SELECT nome FROM public.templates WHERE id='t1'")).rows[0].nome, 'Editado')
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.template_exercicios WHERE template_id='t1'")).rows[0].n, 2)
    await assert.rejects(save({ ...template, id: 'missing' }, [exercise], true), /encontrado/)
    await db.exec("INSERT INTO public.categorias_exercicios VALUES ('Peito'),('Vazia'); INSERT INTO public.biblioteca_exercicios(id,grupo) VALUES ('ex1','Peito')")
    await assert.rejects(db.query("INSERT INTO public.categorias_exercicios VALUES (' peito ')"), /pgp_categorias_nome_unique/)
    await assert.rejects(db.query("INSERT INTO public.biblioteca_exercicios(id,grupo,nome) VALUES ('ex2','Peito',' exercício ')"), /pgp_exercicios_nome_unique/)
    await assert.rejects(db.query("SELECT public.pgp_delete_category('Peito')"), /possui exercícios/)
    await db.query("SELECT public.pgp_delete_category('Vazia')")
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.categorias_exercicios')).rows[0].n, 1)
    await db.exec("DELETE FROM public.templates WHERE id='t1'")
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.template_exercicios')).rows[0].n, 0)
  } finally { await db.close() }
})
