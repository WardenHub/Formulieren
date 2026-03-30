// api/src/db/queries/formsMonitor.sql.ts

export const getFormsMonitorListSql = `
;with params as (
  select
    case
      when try_convert(int, @take) is null or try_convert(int, @take) < 1 then 25
      when try_convert(int, @take) > 200 then 200
      else try_convert(int, @take)
    end as take_n,

    case
      when try_convert(int, @skip) is null or try_convert(int, @skip) < 0 then 0
      else try_convert(int, @skip)
    end as skip_n,

    nullif(ltrim(rtrim(convert(nvarchar(400), @q))), N'') as q_n,
    nullif(ltrim(rtrim(convert(nvarchar(30), @status))), N'') as status_n,
    nullif(ltrim(rtrim(convert(nvarchar(100), @formCode))), N'') as form_code_n,
    nullif(ltrim(rtrim(convert(nvarchar(200), @actor))), N'') as actor_n,

    case when isnull(@mine, 0) = 1 then 1 else 0 end as mine_n,
    case when isnull(@includeWithdrawn, 0) = 1 then 1 else 0 end as include_withdrawn_n,
    case when isnull(@onlyActionable, 0) = 1 then 1 else 0 end as only_actionable_n
),
base as (
  select
    fi.form_instance_id,
    fi.status,
    fi.instance_title,
    fi.instance_note,
    fi.parent_instance_id,
    fi.atrium_installation_code,
    fi.created_at,
    fi.created_by,
    fi.updated_at,
    fi.updated_by,
    fi.submitted_at,
    fi.submitted_by,

    fd.code as form_code,
    fd.name as form_name,
    fv.version,
    fv.version_label,

    ab.installatie_naam,
    ab.object_code,
    ab.obj_naam,
    ab.gebruiker_code,
    ab.gebruiker_naam,

    case when exists (
      select 1
      from dbo.FormInstance child_fi
      where child_fi.parent_instance_id = fi.form_instance_id
    ) then 1 else 0 end as has_children
  from dbo.FormInstance fi
  join dbo.FormDefinitionVersion fv
    on fv.form_version_id = fi.form_version_id
  join dbo.FormDefinition fd
    on fd.form_id = fv.form_id
  left join dbo.AtriumInstallationBase ab
    on ab.installatie_code = fi.atrium_installation_code
  cross join params p
  where
    (p.include_withdrawn_n = 1 or fi.status <> N'INGETROKKEN')
    and (p.status_n is null or fi.status = p.status_n)
    and (p.form_code_n is null or fd.code = p.form_code_n)
    and (
      p.mine_n = 0
      or (
        p.actor_n is not null
        and (
          fi.created_by = p.actor_n
          or fi.submitted_by = p.actor_n
        )
      )
    )
    and (
      p.q_n is null
      or fd.name like N'%' + p.q_n + N'%'
      or fd.code like N'%' + p.q_n + N'%'
      or isnull(fi.instance_title, N'') like N'%' + p.q_n + N'%'
      or isnull(fi.instance_note, N'') like N'%' + p.q_n + N'%'
      or fi.atrium_installation_code like N'%' + p.q_n + N'%'
      or isnull(fi.created_by, N'') like N'%' + p.q_n + N'%'
      or isnull(fi.submitted_by, N'') like N'%' + p.q_n + N'%'
      or isnull(ab.installatie_naam, N'') like N'%' + p.q_n + N'%'
      or isnull(ab.object_code, N'') like N'%' + p.q_n + N'%'
      or isnull(ab.obj_naam, N'') like N'%' + p.q_n + N'%'
      or isnull(ab.gebruiker_code, N'') like N'%' + p.q_n + N'%'
      or isnull(ab.gebruiker_naam, N'') like N'%' + p.q_n + N'%'
    )
),
fu as (
  select
    f.form_instance_id,
    count(*) as follow_up_total_count,
    sum(case when f.status in (N'OPEN', N'WACHTENOPDERDEN') then 1 else 0 end) as follow_up_open_count,
    sum(case when f.status in (N'AFGEHANDELD', N'AFGEWEZEN', N'VERVALLEN', N'INFORMATIEF') then 1 else 0 end) as follow_up_terminal_count
  from dbo.FormFollowUpAction f
  group by f.form_instance_id
),
filtered as (
  select
    b.*,
    isnull(fu.follow_up_total_count, 0) as follow_up_total_count,
    isnull(fu.follow_up_open_count, 0) as follow_up_open_count,
    isnull(fu.follow_up_terminal_count, 0) as follow_up_terminal_count
  from base b
  left join fu
    on fu.form_instance_id = b.form_instance_id
  cross join params p
  where
    p.only_actionable_n = 0
    or (
      b.status in (N'INGEDIEND', N'IN_BEHANDELING')
      or isnull(fu.follow_up_open_count, 0) > 0
    )
),
numbered as (
  select
    *,
    count(*) over() as total_count,
    row_number() over (
      order by
        isnull(updated_at, created_at) desc,
        created_at desc,
        form_instance_id desc
    ) as rn
  from filtered
)
select
  n.form_instance_id,
  n.status,
  n.instance_title,
  n.instance_note,
  n.parent_instance_id,
  n.atrium_installation_code,
  n.created_at,
  n.created_by,
  n.updated_at,
  n.updated_by,
  n.submitted_at,
  n.submitted_by,
  n.form_code,
  n.form_name,
  n.version,
  n.version_label,
  n.installatie_naam,
  n.object_code,
  n.obj_naam,
  n.gebruiker_code,
  n.gebruiker_naam,
  n.has_children,
  n.follow_up_total_count,
  n.follow_up_open_count,
  n.follow_up_terminal_count,
  n.total_count
from numbered n
cross join params p
where n.rn between (p.skip_n + 1) and (p.skip_n + p.take_n)
order by n.rn;
`;

export const getFormsMonitorDetailSql = `
select top 1
  fi.form_instance_id,
  fi.status,
  fi.instance_title,
  fi.instance_note,
  fi.parent_instance_id,
  fi.atrium_installation_code,
  fi.created_at,
  fi.created_by,
  fi.updated_at,
  fi.updated_by,
  fi.submitted_at,
  fi.submitted_by,

  fd.code as form_code,
  fd.name as form_name,
  fv.version,
  fv.version_label,

  ab.installatie_code,
  ab.installatie_naam,
  ab.object_code,
  ab.obj_naam,

  ab.gebruiker_code,
  ab.gebruiker_naam,

  ab.beheerder_code,
  ab.beheerder_naam,

  ab.eigenaar_code,
  ab.eigenaar_naam

from dbo.FormInstance fi
join dbo.FormDefinitionVersion fv
  on fv.form_version_id = fi.form_version_id
join dbo.FormDefinition fd
  on fd.form_id = fv.form_id
left join dbo.AtriumInstallationBase ab
  on ab.installatie_code = fi.atrium_installation_code
where fi.form_instance_id = @formInstanceId;
`;

export const getFormsMonitorParentSql = `
select top 1
  pfi.form_instance_id,
  pfi.status,
  pfi.instance_title,
  pfi.atrium_installation_code,
  fd.code as form_code,
  fd.name as form_name,
  fv.version_label
from dbo.FormInstance child_fi
join dbo.FormInstance pfi
  on pfi.form_instance_id = child_fi.parent_instance_id
join dbo.FormDefinitionVersion fv
  on fv.form_version_id = pfi.form_version_id
join dbo.FormDefinition fd
  on fd.form_id = fv.form_id
where child_fi.form_instance_id = @formInstanceId;
`;

export const getFormsMonitorChildrenSql = `
select
  cfi.form_instance_id,
  cfi.status,
  cfi.instance_title,
  cfi.atrium_installation_code,
  cfi.created_at,
  fd.code as form_code,
  fd.name as form_name,
  fv.version_label
from dbo.FormInstance cfi
join dbo.FormDefinitionVersion fv
  on fv.form_version_id = cfi.form_version_id
join dbo.FormDefinition fd
  on fd.form_id = fv.form_id
where cfi.parent_instance_id = @formInstanceId
order by cfi.created_at desc, cfi.form_instance_id desc;
`;

export const updateFormInstanceStatusSql = `
update dbo.FormInstance
set
  status = @nextStatus,
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
where form_instance_id = @formInstanceId;

select top 1
  form_instance_id,
  status,
  updated_at,
  updated_by
from dbo.FormInstance
where form_instance_id = @formInstanceId;
`;

export const setFormInstanceInBehandelingIfSubmittedSql = `
update dbo.FormInstance
set
  status = N'IN_BEHANDELING',
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
where form_instance_id = @formInstanceId
  and status = N'INGEDIEND';

select top 1
  form_instance_id,
  status,
  updated_at,
  updated_by
from dbo.FormInstance
where form_instance_id = @formInstanceId;
`;