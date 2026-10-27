-- Run manually in Supabase SQL Editor before using the new frontend.
-- No library seeding. Existing tables, columns and relationships are preserved.
BEGIN;

-- Reject duplicate names even when different employees write concurrently.
-- If existing data has duplicates, resolve those manually before retrying;
-- this migration intentionally never removes or merges user data.
CREATE UNIQUE INDEX IF NOT EXISTS pgp_templates_nome_unique
  ON public.templates (lower(btrim(nome)));
CREATE UNIQUE INDEX IF NOT EXISTS pgp_exercicios_nome_unique
  ON public.biblioteca_exercicios (lower(btrim(nome)));
CREATE UNIQUE INDEX IF NOT EXISTS pgp_categorias_nome_unique
  ON public.categorias_exercicios (lower(btrim(nome)));

CREATE OR REPLACE FUNCTION public.pgp_save_template(
  p_template jsonb, p_exercicios jsonb, p_editing boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id text;
  v_field text;
  v_ex jsonb;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.funcionario_ativo(), false) THEN
    RAISE EXCEPTION 'Funcionário ativo autenticado obrigatório.' USING ERRCODE = '42501';
  END IF;
  IF p_editing IS NULL OR jsonb_typeof(p_template) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_exercicios) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Template ou lista de exercícios inválidos.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['id','nome','objetivo','nivel','descricao','data_criacao'] LOOP
    IF jsonb_typeof(p_template -> v_field) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Campo de template inválido: %', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_id := btrim(p_template ->> 'id');
  IF v_id = '' OR btrim(p_template ->> 'nome') = '' OR btrim(p_template ->> 'data_criacao') = ''
     OR p_template ->> 'objetivo' NOT IN ('HIPERTROFIA','EMAGRECIMENTO','FORÇA','DEFINIÇÃO')
     OR p_template ->> 'nivel' NOT IN ('INICIANTE','INTERMEDIÁRIO','AVANÇADO')
     OR jsonb_array_length(p_exercicios) = 0 THEN
    RAISE EXCEPTION 'Preencha nome, objetivo, nível, data e exercícios.' USING ERRCODE = '22023';
  END IF;
  FOR v_ex IN SELECT value FROM jsonb_array_elements(p_exercicios) LOOP
    IF jsonb_typeof(v_ex) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Exercício inválido.' USING ERRCODE = '22023';
    END IF;
    FOREACH v_field IN ARRAY ARRAY['exercicio_id','nome','grupo','foco','instrucoes','equipamento','series','reps','carga','descanso'] LOOP
      IF jsonb_typeof(v_ex -> v_field) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Campo de exercício inválido: %', v_field USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF btrim(v_ex ->> 'nome') = '' OR btrim(v_ex ->> 'exercicio_id') = '' THEN
      RAISE EXCEPTION 'Nome e identificador do exercício obrigatórios.' USING ERRCODE = '22023';
    END IF;
    FOREACH v_field IN ARRAY ARRAY['video_url','gif_url'] LOOP
      IF NOT (v_ex ? v_field) OR jsonb_typeof(v_ex -> v_field) NOT IN ('null','string') THEN
        RAISE EXCEPTION 'URL de exercício inválida: %', v_field USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  -- Serialize RPC saves, including competing creates with the same name.
  PERFORM pg_catalog.pg_advisory_xact_lock(72104, 1);
  IF EXISTS (SELECT 1 FROM public.templates t
    WHERE lower(btrim(t.nome)) = lower(btrim(p_template ->> 'nome'))
      AND (NOT p_editing OR t.id <> v_id)) THEN
    RAISE EXCEPTION 'Já existe um template com esse nome.' USING ERRCODE = '23505';
  END IF;
  IF p_editing THEN
    PERFORM 1 FROM public.templates WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Template não encontrado ou sem permissão.' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.templates SET nome = btrim(p_template ->> 'nome'),
      objetivo = p_template ->> 'objetivo', nivel = p_template ->> 'nivel',
      descricao = p_template ->> 'descricao'
      WHERE id = v_id;
  ELSE
    INSERT INTO public.templates(id,nome,objetivo,nivel,descricao,data_criacao)
    VALUES (v_id,btrim(p_template ->> 'nome'),p_template ->> 'objetivo',
      p_template ->> 'nivel',p_template ->> 'descricao',p_template ->> 'data_criacao');
  END IF;

  -- Prepare replacement children first. Any subsequent failure rolls back
  -- both the parent and children; readers never see an intermediate version.
  WITH inserted AS (
    INSERT INTO public.template_exercicios(template_id,exercicio_id,nome,grupo,foco,
      instrucoes,video_url,gif_url,equipamento,series,reps,carga,descanso,ordem)
    SELECT v_id, e ->> 'exercicio_id', e ->> 'nome', e ->> 'grupo', e ->> 'foco',
      e ->> 'instrucoes', e ->> 'video_url', e ->> 'gif_url', e ->> 'equipamento',
      e ->> 'series', e ->> 'reps', e ->> 'carga', e ->> 'descanso', (position - 1)::integer
    FROM jsonb_array_elements(p_exercicios) WITH ORDINALITY AS items(e, position)
    RETURNING id
  )
  DELETE FROM public.template_exercicios
    WHERE template_id = v_id AND id NOT IN (SELECT id FROM inserted);

  IF (SELECT count(*) FROM public.template_exercicios WHERE template_id = v_id)
      <> jsonb_array_length(p_exercicios) THEN
    RAISE EXCEPTION 'Não foi possível substituir todos os exercícios.' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(t) || jsonb_build_object('template_exercicios',
    (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.ordem), '[]'::jsonb)
      FROM public.template_exercicios e WHERE e.template_id = v_id))
  INTO v_result FROM public.templates t WHERE t.id = v_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgp_delete_category(p_nome text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.funcionario_ativo(), false) THEN
    RAISE EXCEPTION 'Funcionário ativo autenticado obrigatório.' USING ERRCODE = '42501';
  END IF;
  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Categoria obrigatória.' USING ERRCODE = '22023';
  END IF;
  -- Check the remote library, including exercises created by other employees.
  LOCK TABLE public.biblioteca_exercicios IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.biblioteca_exercicios WHERE grupo = p_nome) THEN
    RAISE EXCEPTION 'A categoria possui exercícios. Mova-os antes de excluir.' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.categorias_exercicios WHERE nome = p_nome;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada ou sem permissão.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pgp_save_template(jsonb,jsonb,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pgp_delete_category(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pgp_save_template(jsonb,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pgp_delete_category(text) TO authenticated;
COMMIT;
