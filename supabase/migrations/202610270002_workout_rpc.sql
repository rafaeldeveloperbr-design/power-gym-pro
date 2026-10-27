-- Apply manually in Supabase SQL Editor. No data imports or schema changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.pgp_save_workout(
  p_ficha jsonb, p_divisoes jsonb, p_editing boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id text;
  v_student text;
  v_field text;
  v_div jsonb;
  v_ex jsonb;
  v_div_id uuid;
  v_div_ids uuid[] := ARRAY[]::uuid[];
  v_codes text[] := ARRAY[]::text[];
  v_old_ex_ids uuid[];
  v_position integer := 0;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.funcionario_ativo(), false) THEN
    RAISE EXCEPTION 'Funcionário ativo autenticado obrigatório.' USING ERRCODE = '42501';
  END IF;
  IF p_editing IS NULL OR jsonb_typeof(p_ficha) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_divisoes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Plano ou divisões inválidos.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['id','aluno_id','nome','data'] LOOP
    IF jsonb_typeof(p_ficha -> v_field) IS DISTINCT FROM 'string' OR btrim(p_ficha ->> v_field) = '' THEN
      RAISE EXCEPTION 'Campo obrigatório do plano inválido: %', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT (p_ficha ? 'template_id') OR jsonb_typeof(p_ficha -> 'template_id') NOT IN ('null','string') THEN
    RAISE EXCEPTION 'Template inválido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_divisoes) = 0 THEN
    RAISE EXCEPTION 'Mantenha pelo menos uma divisão.' USING ERRCODE = '22023';
  END IF;
  v_id := p_ficha ->> 'id';
  -- The row lock serializes updates and deletion of the same plan.
  IF p_editing THEN
    SELECT aluno_id INTO v_student FROM public.fichas WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plano não encontrado ou sem permissão.' USING ERRCODE = 'P0002';
    END IF;
    IF v_student <> p_ficha ->> 'aluno_id' THEN
      RAISE EXCEPTION 'Não é permitido transferir o plano de outro aluno.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos WHERE id = p_ficha ->> 'aluno_id') THEN
    RAISE EXCEPTION 'Aluno não encontrado ou sem permissão.' USING ERRCODE = '23503';
  END IF;

  -- Validate the complete replacement before changing existing data.
  FOR v_div IN SELECT value FROM jsonb_array_elements(p_divisoes) LOOP
    IF jsonb_typeof(v_div) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Divisão inválida.' USING ERRCODE = '22023';
    END IF;
    FOREACH v_field IN ARRAY ARRAY['id','codigo','nome'] LOOP
      IF jsonb_typeof(v_div -> v_field) IS DISTINCT FROM 'string' OR btrim(v_div ->> v_field) = '' THEN
        RAISE EXCEPTION 'Campo obrigatório da divisão inválido: %', v_field USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_div_id := (v_div ->> 'id')::uuid;
    IF v_div_id = ANY(v_div_ids) OR upper(btrim(v_div ->> 'codigo')) = ANY(v_codes)
      OR upper(btrim(v_div ->> 'codigo')) !~ '^[A-Z]+$' THEN
      RAISE EXCEPTION 'Código ou identificador de divisão duplicado/inválido.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.divisoes_treino WHERE id = v_div_id AND ficha_id <> v_id) THEN
      RAISE EXCEPTION 'A divisão pertence a outro plano.' USING ERRCODE = '42501';
    END IF;
    v_div_ids := array_append(v_div_ids, v_div_id);
    v_codes := array_append(v_codes, upper(btrim(v_div ->> 'codigo')));
    IF jsonb_typeof(v_div -> 'exercicios') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Lista de exercícios inválida.' USING ERRCODE = '22023';
    END IF;
    FOR v_ex IN SELECT value FROM jsonb_array_elements(v_div -> 'exercicios') LOOP
      IF jsonb_typeof(v_ex) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Exercício inválido.' USING ERRCODE = '22023';
      END IF;
      FOREACH v_field IN ARRAY ARRAY['nome','grupo','foco','instrucoes','equipamento','series','reps','carga','descanso'] LOOP
        IF jsonb_typeof(v_ex -> v_field) IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Campo de exercício inválido: %', v_field USING ERRCODE = '22023';
        END IF;
      END LOOP;
      IF btrim(v_ex ->> 'nome') = '' OR NOT (v_ex ? 'exercicio_id')
        OR jsonb_typeof(v_ex -> 'exercicio_id') NOT IN ('null','string')
        OR (jsonb_typeof(v_ex -> 'exercicio_id') = 'string' AND btrim(v_ex ->> 'exercicio_id') = '') THEN
        RAISE EXCEPTION 'Nome ou identificador do exercício inválido.' USING ERRCODE = '22023';
      END IF;
      FOREACH v_field IN ARRAY ARRAY['video_url','gif_url'] LOOP
        IF NOT (v_ex ? v_field) OR jsonb_typeof(v_ex -> v_field) NOT IN ('null','string') THEN
          RAISE EXCEPTION 'URL de exercício inválida.' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF p_editing THEN
    UPDATE public.fichas SET nome = btrim(p_ficha ->> 'nome'), data = p_ficha ->> 'data',
      template_id = p_ficha ->> 'template_id' WHERE id = v_id;
    -- Temporary codes allow safe A/B code swaps under the existing UNIQUE
    -- constraint. These values are never visible outside this transaction.
    UPDATE public.divisoes_treino SET codigo = '__pgp_' || id::text WHERE ficha_id = v_id;
  ELSE
    INSERT INTO public.fichas(id,aluno_id,nome,data,template_id)
    VALUES (v_id,p_ficha ->> 'aluno_id',btrim(p_ficha ->> 'nome'),p_ficha ->> 'data',p_ficha ->> 'template_id');
  END IF;
  SELECT coalesce(array_agg(e.id), ARRAY[]::uuid[]) INTO v_old_ex_ids
    FROM public.exercicios_treino e JOIN public.divisoes_treino d ON d.id = e.divisao_id
    WHERE d.ficha_id = v_id;

  FOR v_div IN SELECT value FROM jsonb_array_elements(p_divisoes) LOOP
    v_div_id := (v_div ->> 'id')::uuid;
    INSERT INTO public.divisoes_treino(id,ficha_id,codigo,nome,ordem)
    VALUES (v_div_id,v_id,upper(btrim(v_div ->> 'codigo')),btrim(v_div ->> 'nome'),v_position)
    ON CONFLICT (id) DO UPDATE SET codigo = EXCLUDED.codigo, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem
      WHERE public.divisoes_treino.ficha_id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A divisão pertence a outro plano.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.exercicios_treino(divisao_id,exercicio_id,nome,grupo,foco,instrucoes,
      video_url,gif_url,equipamento,series,reps,carga,descanso,ordem)
    SELECT v_div_id, e ->> 'exercicio_id',e ->> 'nome',e ->> 'grupo',e ->> 'foco',e ->> 'instrucoes',
      e ->> 'video_url',e ->> 'gif_url',e ->> 'equipamento',e ->> 'series',e ->> 'reps',e ->> 'carga',
      e ->> 'descanso',(position - 1)::integer
    FROM jsonb_array_elements(v_div -> 'exercicios') WITH ORDINALITY AS items(e,position);
    v_position := v_position + 1;
  END LOOP;
  -- Only remove old children after every replacement insert succeeded.
  DELETE FROM public.exercicios_treino WHERE id = ANY(v_old_ex_ids);
  DELETE FROM public.divisoes_treino WHERE ficha_id = v_id AND NOT (id = ANY(v_div_ids));
  IF (SELECT count(*) FROM public.divisoes_treino WHERE ficha_id = v_id) <> jsonb_array_length(p_divisoes)
    OR (SELECT count(*) FROM public.exercicios_treino e JOIN public.divisoes_treino d ON d.id=e.divisao_id WHERE d.ficha_id=v_id)
      <> (SELECT coalesce(sum(jsonb_array_length(value -> 'exercicios')),0) FROM jsonb_array_elements(p_divisoes)) THEN
    RAISE EXCEPTION 'Substituição incompleta. Nenhuma alteração foi salva.' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('id',f.id,'aluno_id',f.aluno_id,'nome',f.nome,'data',f.data,'template_id',f.template_id,
    'divisoes_treino',(SELECT coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('exercicios_treino',
      (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.ordem),'[]'::jsonb) FROM public.exercicios_treino e WHERE e.divisao_id=d.id)) ORDER BY d.ordem),'[]'::jsonb)
      FROM public.divisoes_treino d WHERE d.ficha_id=f.id)) INTO v_result FROM public.fichas f WHERE f.id=v_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.pgp_save_workout(jsonb,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pgp_save_workout(jsonb,jsonb,boolean) TO authenticated;
COMMIT;
