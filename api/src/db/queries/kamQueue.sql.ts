// De KAM-werklijst. Veiligheidsformulieren hangen aan een project en worden per relatie
// beoordeeld, dus de lijst is gegroepeerd op relatie en niet op installatie. Dit is een
// eigen, smalle weergave over dezelfde tabellen als de Monitor; er wordt niets gedupliceerd
// aan statuslogica, alleen gelezen.

/*  Welke formulieren horen in deze lijst? Niet "de vormcode is KAM", maar "de definitie
    zegt dat de beoordeling per relatie loopt". Daarmee komt een volgend
    veiligheidsformulier er automatisch bij zodra het zo is geconfigureerd.  */
const kamFormScope = `
  fd.review_scope = N'RELATION'
`;

export const getKamQueueRelationsSql = `
;with kam_forms as (
  select
    fi.form_instance_id,
    fi.status,
    fi.instance_title,
    fi.created_at,
    fi.created_by,
    fi.submitted_at,
    fi.submitted_by,
    fi.finalized_at,
    fi.finalized_by,
    fd.code as form_code,
    fd.name as form_name,
    fd.finalize_role_code,
    rel.source_system as relation_source_system,
    rel.source_key as relation_source_key,
    rel.display_label_snapshot as relation_label,
    prj.source_key as project_source_key,
    prj.display_label_snapshot as project_label
  from dbo.FormInstance fi
  join dbo.FormDefinitionVersion fv on fv.form_version_id = fi.form_version_id
  join dbo.FormDefinition fd on fd.form_id = fv.form_id
  outer apply (
    select top 1 fic.source_system, fic.source_key, fic.display_label_snapshot
    from dbo.FormInstanceContext fic
    where fic.form_instance_id = fi.form_instance_id
      and fic.context_type = N'RELATION'
    order by fic.is_primary desc, fic.selected_at asc
  ) rel
  outer apply (
    select top 1 fic.source_key, fic.display_label_snapshot
    from dbo.FormInstanceContext fic
    where fic.form_instance_id = fi.form_instance_id
      and fic.context_type = N'PROJECT'
    order by fic.is_primary desc, fic.selected_at asc
  ) prj
  where ${kamFormScope}
    and fi.status <> N'INGETROKKEN'
),
/*  Alle openstaande veiligheidspunten van die relatie, over projecten heen. Dat is precies
    het overzicht dat de KAM-coördinator wil; niet per formulier, maar per klant.  */
relation_points as (
  select
    ac.context_key as relation_source_key,
    open_count = sum(case when sd.is_terminal = 0 then 1 else 0 end),
    overdue_count = sum(
      case when sd.is_terminal = 0 and a.due_date is not null and a.due_date < convert(date, sysutcdatetime())
        then 1 else 0 end
    ),
    total_count = count(*)
  from dbo.FollowUpAction a
  join dbo.FollowUpActionAtriumContext ac
    on ac.follow_up_action_id = a.follow_up_action_id
   and ac.context_type = N'RELATION'
  join dbo.FollowUpStatusDefinition sd
    on sd.status_code = a.status
  where a.kind = N'workflow'
    and exists (
      select 1
      from dbo.FollowUpActionFormSource fs
      join kam_forms kf on kf.form_instance_id = fs.form_instance_id
      where fs.follow_up_action_id = a.follow_up_action_id
    )
  group by ac.context_key
)
select
  kf.relation_source_key,
  kf.relation_source_system,
  max(kf.relation_label) as relation_label,
  count(*) as form_count,
  sum(case when kf.status = N'INGEDIEND' then 1 else 0 end) as ingediend_count,
  sum(case when kf.status = N'IN_BEHANDELING' then 1 else 0 end) as in_behandeling_count,
  sum(case when kf.status = N'AFGEHANDELD' then 1 else 0 end) as definitief_count,
  sum(case when kf.status = N'CONCEPT' then 1 else 0 end) as concept_count,
  isnull(max(rp.open_count), 0) as open_point_count,
  isnull(max(rp.overdue_count), 0) as overdue_point_count,
  isnull(max(rp.total_count), 0) as total_point_count,
  max(kf.submitted_at) as last_submitted_at
from kam_forms kf
left join relation_points rp
  on rp.relation_source_key = kf.relation_source_key
group by kf.relation_source_key, kf.relation_source_system
order by
  -- Wat wacht op de KAM-coördinator staat boven; daarna wat het langst ligt.
  case when sum(case when kf.status in (N'INGEDIEND', N'IN_BEHANDELING') then 1 else 0 end) > 0
    then 0 else 1 end,
  isnull(max(rp.overdue_count), 0) desc,
  max(kf.submitted_at) asc,
  max(kf.relation_label) asc;
`;

export const getKamQueueFormsSql = `
select
  fi.form_instance_id,
  fi.status,
  fi.instance_title,
  fi.created_at,
  fi.created_by,
  fi.submitted_at,
  fi.submitted_by,
  fi.finalized_at,
  fi.finalized_by,
  fd.code as form_code,
  fd.name as form_name,
  fd.review_scope,
  fd.finalize_role_code,
  rel.source_key as relation_source_key,
  rel.display_label_snapshot as relation_label,
  prj.source_key as project_source_key,
  prj.display_label_snapshot as project_label,
  isnull(pts.open_count, 0) as open_point_count,
  isnull(pts.total_count, 0) as total_point_count
from dbo.FormInstance fi
join dbo.FormDefinitionVersion fv on fv.form_version_id = fi.form_version_id
join dbo.FormDefinition fd on fd.form_id = fv.form_id
outer apply (
  select top 1 fic.source_system, fic.source_key, fic.display_label_snapshot
  from dbo.FormInstanceContext fic
  where fic.form_instance_id = fi.form_instance_id
    and fic.context_type = N'RELATION'
  order by fic.is_primary desc, fic.selected_at asc
) rel
outer apply (
  select top 1 fic.source_key, fic.display_label_snapshot
  from dbo.FormInstanceContext fic
  where fic.form_instance_id = fi.form_instance_id
    and fic.context_type = N'PROJECT'
  order by fic.is_primary desc, fic.selected_at asc
) prj
outer apply (
  select
    open_count = sum(case when sd.is_terminal = 0 then 1 else 0 end),
    total_count = count(*)
  from dbo.FollowUpAction a
  join dbo.FollowUpActionFormSource fs
    on fs.follow_up_action_id = a.follow_up_action_id
  join dbo.FollowUpStatusDefinition sd
    on sd.status_code = a.status
  where fs.form_instance_id = fi.form_instance_id
    and a.kind = N'workflow'
) pts
where ${kamFormScope}
  and fi.status <> N'INGETROKKEN'
  and (@relationSourceKey is null or rel.source_key = @relationSourceKey)
  and (
    isnull(@onlyOpen, 0) = 0
    or fi.status in (N'INGEDIEND', N'IN_BEHANDELING')
  )
order by
  case fi.status
    when N'INGEDIEND' then 0
    when N'IN_BEHANDELING' then 1
    when N'CONCEPT' then 2
    else 3
  end,
  fi.submitted_at asc,
  fi.form_instance_id asc;
`;
