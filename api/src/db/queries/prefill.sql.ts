// /api/src/db/queries/prefill.sql.ts
// =========================================================
// forms prefill (data-driven; keyed like eigenschappen.sql)
// - input: @code, @keysJson (json array of requested keys)
// - output: rows { key, value_json } to be assembled by API
// Notes:
// - Known requested keys always return a row (value can be null / []), so
//   service can derive unknown keys as: requested - returnedKeys.
// =========================================================

export const getFormPrefillSql = `
-- expects:
--   @code nvarchar(...)
--   @formCode nvarchar(...)
--   @keysJson nvarchar(max)  -- json array: ["fc_atrium_...", "fc_inst_...", "es_regels", "k_document_types", ...]

-- IMPORTANT:
-- DB default collation appears to be Latin1_General_BIN2, while involved columns are SQL_Latin1_General_CP1_CI_AS.
-- We pin comparisons to SQL_Latin1_General_CP1_CI_AS to avoid collation conflicts WITHOUT changing semantics.

if not exists (
  select 1
  from dbo.AtriumInstallationBase
  where installatie_code = @code COLLATE SQL_Latin1_General_CP1_CI_AS
)
begin
  throw 50000, 'atrium installation not found', 1;
end;

;with p as (
  select cast(@code as nvarchar(450)) COLLATE SQL_Latin1_General_CP1_CI_AS as code
),
req as (
  select distinct
    cast([value] as nvarchar(400)) COLLATE SQL_Latin1_General_CP1_CI_AS as req_key
  from openjson(@keysJson)
),

-- overlay (optional; can be missing when type not yet chosen)
inst as (
  select top 1
    i.installation_id,
    i.atrium_installation_code,
    i.installation_type_key
  from dbo.Installation i
  where i.atrium_installation_code = (select code from p)
),

-- atrium row as json (single object)
atrium_json as (
  select
    (
      select top 1 a.*
      from dbo.AtriumInstallationBase a
      where a.installatie_code = (select code from p)
      for json path, without_array_wrapper
    ) as js
),

-- unpivot atrium columns -> (col, val)
atrium_kv as (
  select
    j.[key] as fabric_column,
    j.[value] as raw_value
  from atrium_json aj
  cross apply openjson(aj.js) j
),

-- map atrium_kv -> field_key using ExternalFieldDefinition
atrium_fields as (
  select
    N'value' as kind,
    e.field_key as [key],
    case
      when kv.raw_value is null then N'null'
      else N'"' + string_escape(cast(kv.raw_value as nvarchar(max)), 'json') + N'"'
    end as value_json
  from dbo.ExternalFieldDefinition e
  join atrium_kv kv
    on kv.fabric_column COLLATE SQL_Latin1_General_CP1_CI_AS
     = e.fabric_column COLLATE SQL_Latin1_General_CP1_CI_AS
  join req r
    on r.req_key = e.field_key COLLATE SQL_Latin1_General_CP1_CI_AS
  where e.is_active = 1
    and e.source_type = N'fabric'
    and e.fabric_table = N'AtriumInstallationBase'
),

-- custom field values (typed)
custom_fields as (
  select
    N'value' as kind,
    d.field_key as [key],
    case
      when i.installation_id is null then N'null'
      when v.installation_id is null then N'null'
      when d.data_type = N'bool' then
        case
          when v.value_bool is null then N'null'
          when v.value_bool = 1 then N'true'
          else N'false'
        end
      when d.data_type = N'number' then
        case
          when v.value_number is null then N'null'
          else cast(v.value_number as nvarchar(100))
        end
      when d.data_type = N'date' then
        case
          when v.value_date is null then N'null'
          else N'"' + convert(nvarchar(30), v.value_date, 23) + N'"'
        end
      when d.data_type = N'json' then
        case
          when nullif(ltrim(rtrim(isnull(v.value_json, N''))), N'') is null then N'null'
          else v.value_json
        end
      else
        case
          when nullif(ltrim(rtrim(isnull(v.value_string, N''))), N'') is null then N'null'
          else N'"' + string_escape(cast(v.value_string as nvarchar(max)), 'json') + N'"'
        end
    end as value_json
  from dbo.InstallationCustomFieldDefinition d
  join req r
    on r.req_key = d.field_key COLLATE SQL_Latin1_General_CP1_CI_AS
  left join inst i
    on 1 = 1
  left join dbo.InstallationCustomFieldValue v
    on v.installation_id = i.installation_id
   and v.field_key = d.field_key
  where d.is_active = 1
    and r.req_key = d.field_key COLLATE SQL_Latin1_General_CP1_CI_AS
),

-- NEW: custom field choices (options) for requested keys
custom_field_choices as (
  select
    N'choices' as kind,
    o.field_key as [key],
    coalesce((
      select
        x.option_value as value,
        x.option_label as text
      from dbo.InstallationCustomFieldOption x
      where x.is_active = 1
        and x.field_key = o.field_key
      order by isnull(x.sort_order, 999999), x.option_label asc
      for json path
    ), N'[]') as value_json
  from dbo.InstallationCustomFieldOption o
  join req r
    on r.req_key = o.field_key COLLATE SQL_Latin1_General_CP1_CI_AS
  where o.is_active = 1
  group by o.field_key
),

-- energy supplies rows (always return row if requested; [] when no inst or no rows)
energy_rows as (
  select
    N'value' as kind,
    N'es_regels' as [key],
    coalesce((
      select
        es.location_label as es_locatie,
        es.kind as es_soort,
        es.brand_type_key as es_merk_type,
        es.brand_type_manual as es_merk_type_handmatig,
        es.quantity as es_aantal,
        es.configuration as es_schakeling,
        es.nominal_voltage_v as es_nominale_spanning_v,
        es.battery_date as es_datum,
        es.charge_voltage_v as es_laadspanning_v,
        es.capacity_ah as es_capaciteit_ah,
        es.rest_current_ma as es_ruststroom_ma,
        es.alarm_current_ma as es_alarmstroom_ma,
        es.bridging_time_h as es_overbrugging_uren,
        es.advice as es_advies,
        es.remarks as es_opmerking,
        es.sort_order as es_volgorde
      from dbo.InstallationEnergySupply es
      join inst i on i.installation_id = es.installation_id
      where es.is_active = 1
      order by isnull(es.sort_order, 999999), es.created_at asc
      for json path
    ), N'[]') as value_json
  from req r
  where r.req_key = N'es_regels' COLLATE SQL_Latin1_General_CP1_CI_AS
),

-- documents rows (always return row if requested; [] when no inst or no rows)
doc_rows as (
  select
    N'value' as kind,
    N'doc_regels' as [key],
    coalesce((
      select
        d.document_type_key as doc_type,
        d.title as doc_titel,
        d.document_number as doc_nummer,
        d.document_date as doc_datum,
        d.revision as doc_revisie,
        d.file_name as doc_bestandsnaam,
        d.mime_type as doc_mime,
        d.file_size_bytes as doc_grootte_bytes,
        d.storage_provider as doc_storage_provider,
        d.storage_key as doc_storage_key,
        d.storage_url as doc_storage_url,
        d.source_system as doc_bron,
        d.source_reference as doc_bron_id,
        d.is_active as doc_actief,
        d.created_at as doc_aangemaakt_op
      from dbo.InstallationDocument d
      join inst i on i.installation_id = d.installation_id
      where d.is_active = 1
      order by d.created_at desc
      for json path
    ), N'[]') as value_json
  from req r
  where r.req_key = N'doc_regels' COLLATE SQL_Latin1_General_CP1_CI_AS
),

-- performance header (always return row if requested; null when no header or no inst)
perf_header as (
  select
    N'value' as kind,
    N'pr_header' as [key],
    coalesce((
      select top 1
        pr.normering_key as pr_normering,
        pr.doormelding_mode as pr_doormelding,
        pr.remarks as pr_opmerking
      from dbo.InstallationPerformanceRequirement pr
      join inst i on i.installation_id = pr.installation_id
      where pr.is_active = 1
      order by pr.created_at desc
      for json path, without_array_wrapper
    ), N'null') as value_json
  from req r
  where r.req_key = N'pr_header' COLLATE SQL_Latin1_General_CP1_CI_AS
),

-- performance rows (always return row if requested; [] when no rows or no inst)
perf_rows as (
  select
    N'value' as kind,
    N'pr_regels' as [key],
    coalesce((
      select
        r.gebruikersfunctie_key as pr_gebruikersfunctie,
        r.row_label as pr_label,
        r.doormelding_mode as pr_doormelding,
        r.automatic_detectors as pr_aantal_auto,
        r.manual_call_points as pr_aantal_hand,
        r.flame_detectors as pr_aantal_vlam,
        r.linear_smoke_detectors as pr_aantal_lijn,
        r.aspirating_openings as pr_aantal_asp,
        r.sort_order as pr_volgorde
      from dbo.InstallationPerformanceRequirementRow r
      join dbo.InstallationPerformanceRequirement h
        on h.performance_requirement_id = r.performance_requirement_id
       and h.is_active = 1
      join inst i
        on i.installation_id = h.installation_id
      order by r.sort_order asc, r.created_at asc
      for json path
    ), N'[]') as value_json
  from req r
  where r.req_key = N'pr_regels' COLLATE SQL_Latin1_General_CP1_CI_AS
),

-- catalogs (always return row if requested; [] if none)
k_energy_brand_types as (
  select
    N'value' as kind,
    N'k_energy_brand_types' as [key],
    coalesce((
      select
        bt.brand_type_key as value,
        bt.display_name as label,
        bt.default_capacity_ah as default_capacity_ah
      from dbo.EnergySupplyBrandType bt
      where bt.is_active = 1
      order by isnull(bt.sort_order, 999999), bt.display_name asc
      for json path
    ), N'[]') as value_json
  from req r
  where r.req_key = N'k_energy_brand_types' COLLATE SQL_Latin1_General_CP1_CI_AS
),
k_document_types as (
  select
    N'value' as kind,
    N'k_document_types' as [key],
    coalesce((
      select
        dt.document_type_key as value,
        dt.naam as label,
        dt.sectie_key as sectie_key
      from dbo.DocumentType dt
      where dt.is_active = 1
      order by isnull(dt.sort_order, 999999), dt.naam asc
      for json path
    ), N'[]') as value_json
  from req r
  where r.req_key = N'k_document_types' COLLATE SQL_Latin1_General_CP1_CI_AS
),
k_nen_normeringen as (
  select
    N'value' as kind,
    N'k_nen_normeringen' as [key],
    coalesce((
      select
        n.normering_key as value,
        n.display_name as label
      from dbo.Nen2535Normering n
      where n.is_active = 1
      order by n.sort_order asc
      for json path
    ), N'[]') as value_json
  from req r
  where r.req_key = N'k_nen_normeringen' COLLATE SQL_Latin1_General_CP1_CI_AS
),
k_nen_gebruikersfuncties as (
  select
    N'value' as kind,
    N'k_nen_gebruikersfuncties' as [key],
    coalesce((
      select
        g.gebruikersfunctie_key as value,
        g.display_name as label
      from dbo.Nen2535Gebruikersfunctie g
      where g.is_active = 1
      order by g.sort_order asc
      for json path
    ), N'[]') as value_json
  from req r
  where r.req_key = N'k_nen_gebruikersfuncties' COLLATE SQL_Latin1_General_CP1_CI_AS
)

select kind, [key], value_json from atrium_fields
union all
select kind, [key], value_json from custom_fields
union all
select kind, [key], value_json from custom_field_choices
union all
select kind, [key], value_json from energy_rows
union all
select kind, [key], value_json from doc_rows
union all
select kind, [key], value_json from perf_header
union all
select kind, [key], value_json from perf_rows
union all
select kind, [key], value_json from k_energy_brand_types
union all
select kind, [key], value_json from k_document_types
union all
select kind, [key], value_json from k_nen_normeringen
union all
select kind, [key], value_json from k_nen_gebruikersfuncties;
`;

