import { useEffect, useState } from "react";
import { fetchProtectedObjectUrl } from "../api/http.js";

const avatarObjectUrlCache = new Map();
const avatarPendingCache = new Map();

async function getCachedAvatarObjectUrl(path) {
  const cleanPath = String(path || "").trim();
  if (!cleanPath) return null;

  if (avatarObjectUrlCache.has(cleanPath)) {
    return avatarObjectUrlCache.get(cleanPath);
  }

  if (avatarPendingCache.has(cleanPath)) {
    return avatarPendingCache.get(cleanPath);
  }

  const pending = fetchProtectedObjectUrl(cleanPath)
    .then((nextUrl) => {
      avatarObjectUrlCache.set(cleanPath, nextUrl);
      avatarPendingCache.delete(cleanPath);
      return nextUrl;
    })
    .catch((err) => {
      avatarPendingCache.delete(cleanPath);
      throw err;
    });

  avatarPendingCache.set(cleanPath, pending);
  return pending;
}

export default function UserAvatar({
  path,
  fallback = "E",
  alt = "Avatar",
  className = "avatar-badge",
  imageClassName = "profile-avatar-image",
}) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cleanPath = String(path || "").trim();
      if (!cleanPath) {
        setSrc(null);
        return;
      }

      try {
        const nextUrl = await getCachedAvatarObjectUrl(cleanPath);
        if (!cancelled) {
          setSrc(nextUrl || null);
        }
      } catch {
        if (!cancelled) {
          setSrc(null);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <span className={className} aria-hidden={!src ? "true" : undefined}>
      {src ? (
        <img src={src} alt={alt} className={imageClassName} />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  );
}
