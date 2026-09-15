export function formatAppDisplayName(input: {
  readonly baseName: string;
  readonly stageLabel: string;
}): string {
  return `${input.baseName} (${input.stageLabel})`;
}
