WITH test_clock AS (SELECT CONVERT(date,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'W. Europe Standard Time') today),
fixture_installation AS (
  SELECT * FROM (VALUES (N'NONE',N'BMI'),(N'MAINT',N'BMI'),(N'WRONG_TYPE',N'BMI'),(N'COMBI',N'BMI_OAI'),(N'ENDED',N'BMI'),(N'EXPIRED',N'BMI'),(N'UNVERIFIED',N'BMI'),(N'HISTORICAL',N'BMI'),(N'SEPARATE',N'BMI_OAI')) i(atrium_installation_code,installation_type_key)
),
classified_service AS (
  SELECT i.atrium_installation_code installation_code,N'MAINTENANCE' service_category,N'key' contract_key,N'N' contract_historical,
    CAST(NULL AS date) contract_start_date,CASE WHEN i.atrium_installation_code=N'ENDED' THEN DATEADD(day,-1,c.today) ELSE CAST(NULL AS date) END contract_end_date,
    CAST(NULL AS date) paragraph_start_date,CAST(NULL AS date) paragraph_end_date,N'N' paragraph_blocked,N'G' document_status_code,N'STANDARD' end_date_rule
  FROM fixture_installation i CROSS JOIN test_clock c WHERE i.atrium_installation_code IN(N'MAINT',N'ENDED')
),
fixture_requirement AS (
  SELECT i.atrium_installation_code,s.scope,N'REQUIRED' requirement_status,CAST(NULL AS date) effective_from
  FROM fixture_installation i CROSS JOIN (VALUES(N'BMI'),(N'OAI_B')) s(scope)
  WHERE i.atrium_installation_code NOT IN(N'NONE',N'MAINT',N'ENDED') AND (s.scope=N'BMI' OR i.installation_type_key=N'BMI_OAI')
),
fixture_certificate AS (
  SELECT v.id installation_certificate_id,v.code atrium_installation_code,v.certificate_type,
    CASE WHEN v.code=N'HISTORICAL' THEN N'HISTORICAL' ELSE N'CURRENT' END record_status,
    CASE WHEN v.code=N'UNVERIFIED' THEN N'UNVERIFIED' ELSE N'VERIFIED' END verification_status,
    v.id stored_file_id,DATEADD(day,-100,c.today) issue_date,
    CASE WHEN v.code=N'EXPIRED' THEN DATEADD(day,-1,c.today) ELSE DATEADD(day,365,c.today) END valid_until
  FROM (VALUES(1,N'WRONG_TYPE',N'MAINTENANCE'),(2,N'COMBI',N'INSPECTION'),(3,N'EXPIRED',N'INSPECTION'),(4,N'UNVERIFIED',N'INSPECTION'),(5,N'HISTORICAL',N'INSPECTION'),(6,N'SEPARATE',N'INSPECTION'),(7,N'SEPARATE',N'INSPECTION')) v(id,code,certificate_type) CROSS JOIN test_clock c
),
fixture_scope AS (
  SELECT * FROM (VALUES(1,N'BMI'),(2,N'BMI'),(2,N'OAI_B'),(3,N'BMI'),(4,N'BMI'),(5,N'BMI'),(6,N'BMI'),(7,N'OAI_B')) s(installation_certificate_id,scope)
),
fixture_file AS (SELECT installation_certificate_id stored_file_id,CAST(0 AS bit) is_deleted FROM fixture_certificate),
{{POLICY}},
expected AS (
 SELECT * FROM (VALUES
  (N'NONE',N'MAINTENANCE',N'BMI',N'NOT_REQUIRED'),(N'NONE',N'INSPECTION',N'BMI',N'NOT_REQUIRED'),
  (N'MAINT',N'MAINTENANCE',N'BMI',N'MISSING'),(N'MAINT',N'INSPECTION',N'BMI',N'NOT_REQUIRED'),
  (N'WRONG_TYPE',N'INSPECTION',N'BMI',N'MISSING'),
  (N'COMBI',N'INSPECTION',N'BMI',N'VALID'),(N'COMBI',N'INSPECTION',N'OAI_B',N'VALID'),
  (N'ENDED',N'MAINTENANCE',N'BMI',N'CONTRACT_ENDED'),
  (N'EXPIRED',N'INSPECTION',N'BMI',N'EXPIRED'),(N'UNVERIFIED',N'INSPECTION',N'BMI',N'UNKNOWN'),
  (N'HISTORICAL',N'INSPECTION',N'BMI',N'MISSING'),
  (N'SEPARATE',N'INSPECTION',N'BMI',N'VALID'),(N'SEPARATE',N'INSPECTION',N'OAI_B',N'VALID')
 ) e(code,certificate_type,scope,expected_status)
)
SELECT e.*,actual.certificate_status AS actual_status,CAST(CASE WHEN actual.certificate_status=e.expected_status THEN 1 ELSE 0 END AS bit) passed
FROM expected e LEFT JOIN certificate_scope_status actual ON actual.atrium_installation_code=e.code AND actual.certificate_type=e.certificate_type AND actual.scope=e.scope;
