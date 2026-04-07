import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

function getRequiredEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`missing env var ${name}`);
  }
  return String(v).trim();
}

function sanitizePart(value: string) {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitFileNameParts(fileName: string) {
  const raw = String(fileName || "bestand").trim() || "bestand";
  const safe = sanitizePart(raw) || "bestand";

  const lastDot = safe.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === safe.length - 1) {
    return {
      baseName: safe,
      extension: "",
    };
  }

  return {
    baseName: safe.slice(0, lastDot),
    extension: safe.slice(lastDot),
  };
}

function getAccountName() {
  return getRequiredEnv("AZURE_STORAGE_ACCOUNT_NAME");
}

function getContainerName() {
  return getRequiredEnv("AZURE_STORAGE_CONTAINER_NAME");
}

function getConnectionString() {
  return process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() || "";
}

function tryGetAccountKeyFromConnectionString() {
  const cs = getConnectionString();
  if (!cs) return null;

  const parts = cs.split(";").map((x) => x.trim()).filter(Boolean);
  const map = new Map(parts.map((p) => {
    const i = p.indexOf("=");
    if (i < 0) return [p, ""];
    return [p.slice(0, i), p.slice(i + 1)];
  }));

  const accountName = map.get("AccountName") || "";
  const accountKey = map.get("AccountKey") || "";

  if (!accountName || !accountKey) return null;

  return { accountName, accountKey };
}

function getBlobServiceClient() {
  const connectionString = getConnectionString();
  if (connectionString) {
    return BlobServiceClient.fromConnectionString(connectionString);
  }

  const accountName = getAccountName();
  const credential = new DefaultAzureCredential();

  return new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
}

async function getContainerClient() {
  const client = getBlobServiceClient();
  const container = client.getContainerClient(getContainerName());
  await container.createIfNotExists();
  return container;
}

export function buildInstallationDocumentStorageKey(
  installationCode: string,
  originalFileName: string,
  documentId: string
) {
  const { baseName, extension } = splitFileNameParts(originalFileName);
  const safeInstallationCode = sanitizePart(installationCode) || installationCode;
  const safeDocumentId = sanitizePart(documentId) || documentId;

  return `installaties/${safeInstallationCode}/bestanden/${safeDocumentId}/${baseName}${extension}`;
}

export async function uploadInstallationDocumentBlob(args: {
  installationCode: string;
  documentId: string;
  fileName: string;
  contentType?: string | null;
  buffer: Buffer;
}) {
  const { installationCode, documentId, fileName, contentType, buffer } = args;

  const container = await getContainerClient();
  const storageKey = buildInstallationDocumentStorageKey(installationCode, fileName, documentId);
  const blob = container.getBlockBlobClient(storageKey);

  await blob.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: contentType || "application/octet-stream",
    },
  });

  return {
    storageProvider: "azure_blob",
    storageKey,
    storageUrl: null,
  };
}

export async function deleteInstallationDocumentBlob(storageKey: string) {
  if (!storageKey) return;

  const container = await getContainerClient();
  const blob = container.getBlockBlobClient(storageKey);
  await blob.deleteIfExists();
}

export async function createInstallationDocumentDownloadUrl(args: {
  storageKey: string;
  expiresInSeconds?: number;
  downloadFileName?: string | null;
}) {
  const { storageKey, expiresInSeconds = 300, downloadFileName } = args;

  const containerName = getContainerName();
  const blobServiceClient = getBlobServiceClient();
  const container = blobServiceClient.getContainerClient(containerName);
  const blob = container.getBlobClient(storageKey);

  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);

  const shared = tryGetAccountKeyFromConnectionString();

  if (shared) {
    const credential = new StorageSharedKeyCredential(shared.accountName, shared.accountKey);

    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: storageKey,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
        contentDisposition: downloadFileName
          ? `inline; filename="${String(downloadFileName).replace(/"/g, "")}"`
          : undefined,
      },
      credential
    ).toString();

    return `${blob.url}?${sas}`;
  }

  const accountName = getAccountName();
  const userDelegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: storageKey,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
      contentDisposition: downloadFileName
        ? `inline; filename="${String(downloadFileName).replace(/"/g, "")}"`
        : undefined,
    },
    userDelegationKey,
    accountName
  ).toString();

  return `${blob.url}?${sas}`;
}

export async function downloadInstallationDocumentBlob(storageKey: string) {
  if (!storageKey) {
    throw new Error("missing storageKey");
  }

  const container = await getContainerClient();
  const blob = container.getBlobClient(storageKey);

  const exists = await blob.exists();
  if (!exists) {
    throw new Error("blob not found");
  }

  const response = await blob.download();

  const chunks: Buffer[] = [];
  const stream = response.readableStreamBody;

  if (!stream) {
    throw new Error("blob download stream missing");
  }

  for await (const chunk of stream as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const buffer = Buffer.concat(chunks);

  return {
    buffer,
    contentType: response.contentType || "application/octet-stream",
    contentLength: response.contentLength ?? buffer.length,
  };
}