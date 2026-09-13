select t.name as table_name,c.name as column_name,ty.name as type_name,c.max_length,c.is_nullable
from sys.tables t join sys.columns c on c.object_id=t.object_id join sys.types ty on ty.user_type_id=c.user_type_id
where t.name in(N'InstallationType',N'DocumentTypeInstallationType',N'StoredFile',N'InspectionCase',N'InstallationCertificate')
order by t.name,c.column_id;
