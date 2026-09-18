// /api/src/db/queries/documentSignatures.sql.ts

export const getSignableDocumentSql = `
-- expects: @code, @documentId

select top 1
  d.document_id,
  d.atrium_installation_code,
  d.document_type_key,
  d.relation_type,
  d.title,
  d.document_number,
  d.revision,
  d.document_date,
  d.is_signed,
  d.is_active,

  dt.naam as document_type_name,
  dt.tracks_signature,
  dt.supports_esignature,

  sf.stored_file_id,
  sf.file_name,
  sf.mime_type,
  sf.storage_key
from dbo.InstallationDocument d
join dbo.DocumentType dt
  on dt.document_type_key = d.document_type_key
left join dbo.StoredFile sf
  on sf.stored_file_id = d.stored_file_id
 and sf.is_deleted = 0
where d.atrium_installation_code = @code
  and d.document_id = @documentId;
`;

export const createSignatureRequestSql = `
-- expects: @code, @documentId, @placementMethod, @message, @signersJson, @createdBy

set nocount on;

if not exists (
  select 1
  from dbo.InstallationDocument d
  where d.atrium_installation_code = @code
    and d.document_id = @documentId
)
begin
  throw 50000, 'document not found', 1;
end;

-- Een tweede openstaande ronde op hetzelfde document levert twee waarheden op over wie
-- er nog moet tekenen. Een ronde loopt dus af voordat de volgende begint.
if exists (
  select 1
  from dbo.DocumentSignatureRequest r
  where r.document_id = @documentId
    and r.status in (N'DRAFT', N'SENT')
)
begin
  throw 50000, 'signature request already open', 1;
end;

declare @newId uniqueidentifier = newid();

insert into dbo.DocumentSignatureRequest (
  signature_request_id,
  document_id,
  atrium_installation_code,
  placement_method,
  status,
  message,
  created_by
)
values (
  @newId,
  @documentId,
  @code,
  @placementMethod,
  N'DRAFT',
  @message,
  @createdBy
);

insert into dbo.DocumentSignatureSigner (
  signature_request_id,
  signing_order,
  provider_role_key,
  full_name,
  email,
  capacity,
  user_object_id,
  status
)
select
  @newId,
  s.signing_order,
  s.provider_role_key,
  s.full_name,
  s.email,
  nullif(ltrim(rtrim(s.capacity)), N''),
  nullif(ltrim(rtrim(s.user_object_id)), N''),
  N'PENDING'
from openjson(@signersJson)
with (
  signing_order int '$.signing_order',
  provider_role_key nvarchar(50) '$.provider_role_key',
  full_name nvarchar(200) '$.full_name',
  email nvarchar(320) '$.email',
  capacity nvarchar(200) '$.capacity',
  user_object_id nvarchar(100) '$.user_object_id'
) s;

select @newId as signature_request_id;
`;

export const getSignatureRequestSql = `
-- expects: @signatureRequestId

select top 1
  r.signature_request_id,
  r.document_id,
  r.atrium_installation_code,
  r.provider,
  r.provider_package_id,
  r.placement_method,
  r.status,
  r.message,
  r.signed_stored_file_id,
  r.evidence_stored_file_id,
  r.created_at,
  r.created_by,
  r.sent_at,
  r.sent_by,
  r.completed_at,
  r.closed_reason,
  signed_file.file_name as signed_file_name,
  evidence_file.file_name as evidence_file_name
from dbo.DocumentSignatureRequest r
left join dbo.StoredFile signed_file
  on signed_file.stored_file_id = r.signed_stored_file_id
 and signed_file.is_deleted = 0
left join dbo.StoredFile evidence_file
  on evidence_file.stored_file_id = r.evidence_stored_file_id
 and evidence_file.is_deleted = 0
where r.signature_request_id = @signatureRequestId;
`;

export const getLatestSignatureRequestForDocumentSql = `
-- expects: @code, @documentId

select top 1
  r.signature_request_id
from dbo.DocumentSignatureRequest r
where r.atrium_installation_code = @code
  and r.document_id = @documentId
order by r.created_at desc;
`;

export const getSignatureRequestByPackageSql = `
-- expects: @packageId

select top 1
  r.signature_request_id,
  r.document_id,
  r.atrium_installation_code,
  r.provider_package_id,
  r.status
from dbo.DocumentSignatureRequest r
where r.provider = N'VALIDSIGN'
  and r.provider_package_id = @packageId;
`;

export const getSignatureRequestSignersSql = `
-- expects: @signatureRequestId

select
  s.signature_signer_id,
  s.signing_order,
  s.provider_role_key,
  s.full_name,
  s.email,
  s.capacity,
  s.user_object_id,
  s.status,
  s.signed_at,
  s.status_detail
from dbo.DocumentSignatureSigner s
where s.signature_request_id = @signatureRequestId
order by s.signing_order;
`;

export const setSignaturePackageIdSql = `
-- expects: @signatureRequestId, @packageId

update dbo.DocumentSignatureRequest
set provider_package_id = @packageId
where signature_request_id = @signatureRequestId
  and status = N'DRAFT';

select @@rowcount as affected;
`;

export const markSignatureRequestSentSql = `
-- expects: @signatureRequestId, @sentBy

update dbo.DocumentSignatureRequest
set status = N'SENT',
    sent_at = sysutcdatetime(),
    sent_by = @sentBy
where signature_request_id = @signatureRequestId
  and status = N'DRAFT';

select @@rowcount as affected;
`;

export const setSignatureRequestStatusSql = `
-- expects: @signatureRequestId, @status, @closedReason

-- Een afgeronde ronde blijft afgerond; een late callback mag de uitkomst niet omzetten.
update dbo.DocumentSignatureRequest
set status = @status,
    closed_reason = coalesce(@closedReason, closed_reason)
where signature_request_id = @signatureRequestId
  and status in (N'DRAFT', N'SENT');

select @@rowcount as affected;
`;

export const setSignerStatusSql = `
-- expects: @signatureRequestId, @email, @status, @statusDetail

update dbo.DocumentSignatureSigner
set status = @status,
    signed_at = case when @status = N'SIGNED' then sysutcdatetime() else signed_at end,
    status_detail = coalesce(@statusDetail, status_detail)
where signature_request_id = @signatureRequestId
  and lower(email) = lower(@email);

select @@rowcount as affected;
`;

export const markAllSignersSignedSql = `
-- expects: @signatureRequestId

update dbo.DocumentSignatureSigner
set status = N'SIGNED',
    signed_at = coalesce(signed_at, sysutcdatetime())
where signature_request_id = @signatureRequestId
  and status = N'PENDING';
`;

export const insertSignatureStoredFileSql = `
-- expects:
-- @storageProvider, @storageContainer, @storageKey, @storageUrl,
-- @fileName, @mimeType, @fileExtension, @fileSizeBytes, @checksumSha256, @uploadedBy

set nocount on;

declare @storedFileId uniqueidentifier = newid();

insert into dbo.StoredFile (
  stored_file_id,
  storage_provider,
  storage_container,
  storage_key,
  storage_url,
  file_name,
  mime_type,
  file_extension,
  file_size_bytes,
  checksum_sha256,
  uploaded_by,
  created_by
)
values (
  @storedFileId,
  @storageProvider,
  @storageContainer,
  @storageKey,
  @storageUrl,
  @fileName,
  @mimeType,
  @fileExtension,
  @fileSizeBytes,
  @checksumSha256,
  @uploadedBy,
  @uploadedBy
);

select @storedFileId as stored_file_id;
`;

export const completeSignatureRequestSql = `
-- expects: @signatureRequestId, @signedStoredFileId, @evidenceStoredFileId

set nocount on;

declare @documentId uniqueidentifier;

select @documentId = r.document_id
from dbo.DocumentSignatureRequest r
where r.signature_request_id = @signatureRequestId;

if @documentId is null
begin
  throw 50000, 'signature request not found', 1;
end;

update dbo.DocumentSignatureRequest
set status = N'COMPLETED',
    completed_at = sysutcdatetime(),
    signed_stored_file_id = coalesce(@signedStoredFileId, signed_stored_file_id),
    evidence_stored_file_id = coalesce(@evidenceStoredFileId, evidence_stored_file_id)
where signature_request_id = @signatureRequestId;

-- Het document zelf blijft het aangeleverde bestand; alleen de vlag gaat om. Het
-- getekende exemplaar en het bewijs hangen aan de ronde.
update dbo.InstallationDocument
set is_signed = 1,
    updated_at = sysutcdatetime(),
    updated_by = N'VALIDSIGN'
where document_id = @documentId;

select @documentId as document_id;
`;

export const getSignatureStoredFileSql = `
-- expects: @signatureRequestId, @kind

select top 1
  sf.stored_file_id,
  sf.storage_key,
  sf.file_name,
  sf.mime_type,
  sf.file_size_bytes
from dbo.DocumentSignatureRequest r
join dbo.StoredFile sf
  on sf.stored_file_id = case
       when @kind = N'SIGNED' then r.signed_stored_file_id
       else r.evidence_stored_file_id
     end
 and sf.is_deleted = 0
where r.signature_request_id = @signatureRequestId;
`;

export const insertSignatureEventSql = `
-- expects: @signatureRequestId, @documentId, @eventType, @eventBy, @detail, @payloadJson

insert into dbo.DocumentSignatureEvent (
  signature_request_id,
  document_id,
  event_type,
  event_by,
  detail,
  payload_json
)
values (
  @signatureRequestId,
  @documentId,
  @eventType,
  @eventBy,
  @detail,
  @payloadJson
);
`;

export const getSignatureEventsForDocumentSql = `
-- expects: @documentId

select
  e.event_at,
  e.event_type,
  e.event_by,
  e.detail
from dbo.DocumentSignatureEvent e
left join dbo.DocumentSignatureRequest r
  on r.signature_request_id = e.signature_request_id
where e.document_id = @documentId
   or r.document_id = @documentId
order by e.event_at desc;
`;

export const applyVersionSignatureDecisionSql = `
-- expects: @code, @documentId, @keepSigned, @reason, @decidedBy

set nocount on;

declare @relationType nvarchar(30);
declare @parentId uniqueidentifier;

select
  @relationType = d.relation_type,
  @parentId = d.parent_document_id
from dbo.InstallationDocument d
where d.atrium_installation_code = @code
  and d.document_id = @documentId;

if @relationType is null and @parentId is null
begin
  throw 50000, 'document not found', 1;
end;

-- De keuze hoort alleen bij een nieuwe versie van een bestaand document; zonder ouder
-- is er niets om over te nemen.
if @parentId is null or upper(@relationType) <> N'VERVANGING'
begin
  throw 50000, 'document is not a replacement', 1;
end;

update dbo.InstallationDocument
set is_signed = case when @keepSigned = 1 then 1 else 0 end,
    updated_at = sysutcdatetime(),
    updated_by = @decidedBy
where document_id = @documentId;

insert into dbo.DocumentSignatureEvent (
  document_id,
  event_type,
  event_by,
  detail
)
values (
  @documentId,
  case when @keepSigned = 1 then N'SIGNATURE_CARRIED_OVER' else N'SIGNATURE_RESET' end,
  @decidedBy,
  @reason
);

select @documentId as document_id;
`;
