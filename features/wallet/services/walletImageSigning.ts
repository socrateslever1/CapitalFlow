/**
 * Supabase Storage signs many card/account images in one request per batch,
 * rather than one network round-trip per image. All URLs stay in memory.
 */
export async function signWalletImagePaths(
  input: Array<string | null | undefined>,
  signBatch: (paths: string[]) => Promise<{
    data: Array<{ signedUrl?: string | null; error?: unknown }> | null;
    error?: unknown;
  }>,
  batchSize = 50,
): Promise<Map<string, string>> {
  const paths = [...new Set(input.filter((path): path is string => Boolean(path)))];
  const urls = new Map<string, string>();
  for (let start = 0; start < paths.length; start += batchSize) {
    const chunk = paths.slice(start, start + batchSize);
    const { data, error } = await signBatch(chunk);
    if (error || !data) continue; // Custom images are optional; financial data still loads.
    chunk.forEach((path, index) => {
      const item = data[index];
      if (item?.signedUrl && !item.error) urls.set(path, item.signedUrl);
    });
  }
  return urls;
}
