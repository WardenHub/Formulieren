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
  fd.document_profile_key,
  fd.workflow_profile_key,
  fd.official_document_number,

  fv.version_label,
  fv.certification_mark_key,
  fv.survey_json,

  cmd.authority_code as certification_mark_authority_code,
  cmd.scheme_code as certification_mark_scheme_code,
  cmd.process_code as certification_mark_process_code,
  cmd.display_name as certification_mark_display_name,
  cmd.asset_file_name as certification_mark_asset_file_name,
  cmd.source_url as certification_mark_source_url,

  fa.answers_json,

  ab.installatie_naam,
  ab.BedrijfUnit as bedrijf_unit,
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
left join dbo.CertificationMarkDefinition cmd
  on cmd.certification_mark_key = fv.certification_mark_key
left join dbo.FormAnswer fa
  on fa.form_instance_id = fi.form_instance_id
left join dbo.AtriumInstallationBase ab
  on ab.installatie_code = fi.atrium_installation_code
where fi.form_instance_id = @formInstanceId;
`;
