export function formatToTitleCase(value: string): string {
  if (!value) return value;

  const lowerCaseWords = [
    "de", "da", "do", "das", "dos",
    "e", "em", "na", "no", "nas", "nos",
    "a", "o", "as", "os"
  ];

  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (index !== 0 && lowerCaseWords.includes(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}