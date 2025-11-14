interface Kerning {
  groupsSide1: Record<string, string[]>;
  groupsSide2: Record<string, string[]>;
  sourceIdentifiers: string[];
  values: Record<string, Record<string, number>>;
}
