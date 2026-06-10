// api/src/db/queries/formsAssistant.sql.ts

export const getAssistantFormInstanceContextSql = `
SELECT TOP 1
  fi.form_instance_id,
  fi.installation_id,
  fi.atrium_installation_code,
  ab.installation_status,
  fi.status,
  fi.draft_rev,
  fi.form_version_id,
  fd.code AS form_code,
  fd.name AS form_name,
  fdv.version,
  fdv.version_label
FROM dbo.FormInstance fi
JOIN dbo.FormDefinitionVersion fdv
  ON fdv.form_version_id = fi.form_version_id
JOIN dbo.FormDefinition fd
  ON fd.form_id = fdv.form_id
LEFT JOIN dbo.AtriumInstallationBase ab
  ON ab.installatie_code = fi.atrium_installation_code
WHERE fi.form_instance_id = @instanceId
  AND fi.atrium_installation_code = @code;
`;

export const createAssistantSessionSql = `
INSERT INTO dbo.FormAssistantSession (
  form_instance_id,
  installation_id,
  atrium_installation_code,
  status,
  entry_point,
  active_page_name,
  active_question_name,
  active_section_key,
  client_context_json,
  started_by
)
OUTPUT
  inserted.assistant_session_id,
  inserted.form_instance_id,
  inserted.installation_id,
  inserted.atrium_installation_code,
  inserted.status,
  inserted.started_at,
  inserted.started_by
VALUES (
  @formInstanceId,
  @installationId,
  @code,
  N'OPEN',
  @entryPoint,
  @activePageName,
  @activeQuestionName,
  @activeSectionKey,
  @clientContextJson,
  @startedBy
);
`;

export const getAssistantSessionSql = `
SELECT TOP 1
  s.assistant_session_id,
  s.form_instance_id,
  s.installation_id,
  s.atrium_installation_code,
  s.status
FROM dbo.FormAssistantSession s
WHERE s.assistant_session_id = @assistantSessionId
  AND s.form_instance_id = @formInstanceId
  AND s.atrium_installation_code = @code;
`;

export const createAssistantTurnSql = `
INSERT INTO dbo.FormAssistantTurn (
  assistant_session_id,
  form_instance_id,
  installation_id,
  atrium_installation_code,
  turn_kind,
  input_mode,
  language_code,
  provider,
  provider_model,
  raw_input_text,
  transcript_text,
  normalized_text,
  assistant_message,
  local_command_name,
  local_command_confidence,
  request_context_json,
  ai_request_json,
  ai_response_json,
  ai_usage_json,
  latency_ms,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  error_message,
  created_by
)
OUTPUT
  inserted.assistant_turn_id,
  inserted.assistant_session_id,
  inserted.form_instance_id,
  inserted.turn_kind,
  inserted.input_mode,
  inserted.transcript_text,
  inserted.normalized_text,
  inserted.assistant_message,
  inserted.local_command_name,
  inserted.local_command_confidence,
  inserted.latency_ms,
  inserted.created_at
VALUES (
  @assistantSessionId,
  @formInstanceId,
  @installationId,
  @code,
  @turnKind,
  @inputMode,
  @languageCode,
  @provider,
  @providerModel,
  @rawInputText,
  @transcriptText,
  @normalizedText,
  @assistantMessage,
  @localCommandName,
  @localCommandConfidence,
  @requestContextJson,
  @aiRequestJson,
  @aiResponseJson,
  @aiUsageJson,
  @latencyMs,
  @promptTokens,
  @completionTokens,
  @totalTokens,
  @errorMessage,
  @createdBy
);
`;

export const createAssistantAudioSql = `
INSERT INTO dbo.FormAssistantAudio (
  assistant_session_id,
  assistant_turn_id,
  form_instance_id,
  installation_id,
  atrium_installation_code,
  file_name,
  mime_type,
  file_size_bytes,
  duration_ms,
  storage_provider,
  storage_key,
  storage_url,
  checksum_sha256,
  captured_by
)
OUTPUT
  inserted.assistant_audio_id,
  inserted.assistant_session_id,
  inserted.assistant_turn_id,
  inserted.file_name,
  inserted.mime_type,
  inserted.file_size_bytes,
  inserted.storage_provider,
  inserted.storage_key,
  inserted.storage_url,
  inserted.checksum_sha256,
  inserted.captured_at
VALUES (
  @assistantSessionId,
  @assistantTurnId,
  @formInstanceId,
  @installationId,
  @code,
  @fileName,
  @mimeType,
  @fileSizeBytes,
  @durationMs,
  @storageProvider,
  @storageKey,
  @storageUrl,
  @checksumSha256,
  @capturedBy
);
`;

export const createAssistantPatchSql = `
INSERT INTO dbo.FormAssistantPatch (
  assistant_session_id,
  assistant_turn_id,
  form_instance_id,
  installation_id,
  atrium_installation_code,
  patch_status,
  patch_op,
  patch_sequence,
  target_kind,
  target_path,
  target_label,
  question_name,
  matrix_name,
  matrix_row_index,
  matrix_row_key,
  matrix_column_name,
  group_key,
  item_code,
  old_value_json,
  new_value_json,
  patch_json,
  confidence,
  source_text,
  reason,
  proposed_by
)
OUTPUT
  inserted.assistant_patch_id,
  inserted.assistant_session_id,
  inserted.assistant_turn_id,
  inserted.form_instance_id,
  inserted.patch_status,
  inserted.patch_op,
  inserted.patch_sequence,
  inserted.target_kind,
  inserted.target_path,
  inserted.target_label,
  inserted.question_name,
  inserted.matrix_name,
  inserted.matrix_row_index,
  inserted.matrix_row_key,
  inserted.matrix_column_name,
  inserted.group_key,
  inserted.item_code,
  inserted.old_value_json,
  inserted.new_value_json,
  inserted.patch_json,
  inserted.confidence,
  inserted.source_text,
  inserted.reason,
  inserted.proposed_at
VALUES (
  @assistantSessionId,
  @assistantTurnId,
  @formInstanceId,
  @installationId,
  @code,
  N'PROPOSED',
  @patchOp,
  @patchSequence,
  @targetKind,
  @targetPath,
  @targetLabel,
  @questionName,
  @matrixName,
  @matrixRowIndex,
  @matrixRowKey,
  @matrixColumnName,
  @groupKey,
  @itemCode,
  @oldValueJson,
  @newValueJson,
  @patchJson,
  @confidence,
  @sourceText,
  @reason,
  @proposedBy
);
`;

export const markAssistantPatchesAppliedSql = `
UPDATE p
SET
  patch_status = N'APPLIED',
  applied_at = sysutcdatetime(),
  applied_by = @appliedBy,
  applied_draft_rev = @appliedDraftRev,
  error_message = NULL
OUTPUT
  inserted.assistant_patch_id,
  inserted.patch_status,
  inserted.applied_at,
  inserted.applied_by,
  inserted.applied_draft_rev
FROM dbo.FormAssistantPatch p
WHERE p.form_instance_id = @formInstanceId
  AND p.atrium_installation_code = @code
  AND p.patch_status = N'PROPOSED'
  AND p.assistant_patch_id IN (
    SELECT TRY_CONVERT(bigint, [value])
    FROM OPENJSON(@patchIdsJson)
  );
`;

export const markAssistantPatchesRejectedSql = `
UPDATE p
SET
  patch_status = N'REJECTED',
  rejected_at = sysutcdatetime(),
  rejected_by = @rejectedBy,
  rejected_reason = @rejectedReason,
  error_message = NULL
OUTPUT
  inserted.assistant_patch_id,
  inserted.patch_status,
  inserted.rejected_at,
  inserted.rejected_by,
  inserted.rejected_reason
FROM dbo.FormAssistantPatch p
WHERE p.form_instance_id = @formInstanceId
  AND p.atrium_installation_code = @code
  AND p.patch_status = N'PROPOSED'
  AND p.assistant_patch_id IN (
    SELECT TRY_CONVERT(bigint, [value])
    FROM OPENJSON(@patchIdsJson)
  );
`;

export const getAssistantAuditSql = `
SELECT TOP (@take)
  *
FROM dbo.FormAssistantAuditView
WHERE form_instance_id = @formInstanceId
  AND atrium_installation_code = @code
ORDER BY
  started_at DESC,
  turn_created_at DESC,
  patch_sequence ASC,
  assistant_patch_id ASC;
`;

export const getAdminAssistantAuditSql = `
DECLARE @qLike nvarchar(600) = NULL;

IF @q IS NOT NULL AND LTRIM(RTRIM(@q)) <> N''
BEGIN
  SET @qLike = N'%' + LTRIM(RTRIM(@q)) + N'%';
END;

SELECT TOP (@take)
  *
FROM dbo.FormAssistantAuditView
WHERE
  (
    @qLike IS NULL
    OR atrium_installation_code LIKE @qLike
    OR form_code LIKE @qLike
    OR form_name LIKE @qLike
    OR transcript_text LIKE @qLike
    OR normalized_text LIKE @qLike
    OR local_command_name LIKE @qLike
    OR target_label LIKE @qLike
    OR target_path LIKE @qLike
    OR CONVERT(nvarchar(50), form_instance_id) LIKE @qLike
    OR CONVERT(nvarchar(50), assistant_session_id) LIKE @qLike
    OR CONVERT(nvarchar(50), assistant_turn_id) LIKE @qLike
  )
ORDER BY
  COALESCE(turn_created_at, started_at) DESC,
  assistant_session_id DESC,
  assistant_turn_id DESC,
  patch_sequence ASC,
  assistant_patch_id ASC;
`;
