export function wrapText(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderReactionBubble(text: string, width = 22): string[] {
  const content = wrapText(text, Math.max(8, width - 4)).slice(0, 3);
  if (content.length === 0) return [];
  const innerWidth = Math.max(...content.map((line) => line.length));
  const top = `.${'-'.repeat(innerWidth + 2)}.`;
  const body = content.map((line) => `| ${line.padEnd(innerWidth)} |`);
  return [top, ...body, `'${'-'.repeat(innerWidth + 2)}'`];
}

export function renderHearts(): string[] {
  return ['  ♥  ♥  ♥  '];
}
