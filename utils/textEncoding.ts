const MOJIBAKE_MARKERS = /(?:Ã.|Â.|â(?:€|™|œ|“|”|–|—)|�)/;

const decodeUtf8Bytes = (value: string) => {
  if ([...value].some((character) => character.charCodeAt(0) > 255)) return value;

  try {
    const bytes = Uint8Array.from([...value], (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
};

/** Repara UTF-8 interpretado como Latin-1 sem alterar texto Unicode válido. */
export const repairMojibake = (value: unknown): string => {
  if (typeof value !== 'string' || !MOJIBAKE_MARKERS.test(value)) return typeof value === 'string' ? value : '';

  let repaired = value;
  for (let attempt = 0; attempt < 2 && MOJIBAKE_MARKERS.test(repaired); attempt += 1) {
    const decoded = decodeUtf8Bytes(repaired);
    if (decoded === repaired) break;
    repaired = decoded;
  }

  return repaired;
};
