// api/src/db/queries/formReportPdf.sql.ts

export const getFormReportPdfSql = `
select top 1
  fi.form_instance_id,
  fi.status,
  fi.instance_title,
  fi.instance_note,
  fi.atrium_installation_code,
  fi.created_at,
  fi.created_by,
  fi.updated_at,
  fi.updated_by,
  fi.submitted_at,
  fi.submitted_by,

  fd.name as form_name,
  fd.code as form_code,

  fv.version_label,
  fv.survey_json,

  fa.answers_json,

  ab.installatie_naam,
  ab.obj_naam,
  ab.obj_adr_formatted,
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
left join dbo.FormAnswer fa
  on fa.form_instance_id = fi.form_instance_id
left join dbo.AtriumInstallationBase ab
  on ab.installatie_code = fi.atrium_installation_code
where fi.form_instance_id = @formInstanceId;
`;
