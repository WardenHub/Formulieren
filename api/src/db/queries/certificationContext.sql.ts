import { operationalCtes } from "./installationOperational.sql.js";

export const getCertificationContextSql = `${operationalCtes}
select i.installation_type_key,
  coalesce((select cs.scope,cs.certificate_type,cs.contract_status,cs.requirement_status,cs.source_type,cs.certificate_status
    from certificate_scope_status cs where cs.atrium_installation_code=a.installatie_code
    order by cs.scope,cs.certificate_type for json path),N'[]') as summary_json,
  (select contract_status from certification_contracts where installation_code=a.installatie_code and service_category=N'MAINTENANCE') as maintenance_contract_status,
  (select contract_status from certification_contracts where installation_code=a.installatie_code and service_category=N'INSPECTION_SERVICE') as inspection_service_status,
  coalesce((select s.service_category,s.contract_key,s.contract_historical,s.contract_start_date,s.contract_end_date,
    s.paragraph_start_date,s.paragraph_end_date,s.paragraph_blocked,s.document_status_code,s.end_date_rule,
    s.fabric_loaded_at
    from classified_service s where s.installation_code=a.installatie_code
    and s.service_category in (N'MAINTENANCE',N'INSPECTION_SERVICE') for json path),N'[]') as services_json
from dbo.AtriumInstallationBase a
left join dbo.Installation i on i.atrium_installation_code=a.installatie_code
where a.installatie_code=@code;
`;
