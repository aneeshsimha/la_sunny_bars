export function openTableUrl(name: string): string {
  return `https://www.opentable.com/s?term=${encodeURIComponent(name)}`;
}

export function resyUrl(name: string): string {
  return `https://resy.com/cities/la?query=${encodeURIComponent(name)}`;
}
