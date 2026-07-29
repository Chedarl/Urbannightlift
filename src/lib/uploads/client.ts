"use client";

/**
 * Uploads a file straight to Supabase Storage using a short-lived signed URL.
 *
 * The bytes never pass through Next.js, which is what keeps a 10 MB ID card
 * scan from becoming a serverless function's problem. Returns the stored path
 * (`bucket/key`), which is what we persist — never a public URL, because most
 * of these buckets are private on purpose.
 */
export async function uploadFile(
  file: File,
  bucket: string,
  prefix: string
): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, fileName: file.name, orderCode: prefix }),
  });
  const { signedUrl, path, error } = await res.json();
  if (!signedUrl) throw new Error(error ?? "upload failed");

  const put = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("upload failed");

  return path as string;
}
