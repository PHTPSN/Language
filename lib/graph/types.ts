export type NodeKind = "root" | "layer" | "pos" | "domain" | "concept" | "sense" | "lexeme" | "frame";
export type GraphRelation = { target: string; type: string; incoming?: boolean };
export type GraphNode = {
  id: string; label: string; kind: NodeKind; definition: string;
  children: string[]; relations: GraphRelation[]; parent?: string;
  pos?: string; domain?: string; lexeme?: string; concept?: string;
  examples?: string[]; pronunciation?: string[]; forms?: string[];
  childCount?: number;
};
export type GraphManifest = {
  version: string; source: string; sourceUrl: string; license: string; licenseUrl: string;
  sha256: string; attribution: string; transformations: string[];
  counts: { lexicalEntries: number; lexemes: number; senses: number; concepts: number; sourceRelations: number; frames: number; nodes: number };
  coverage: { included: string[]; missing: string[] };
};
export type GraphView = { root: string; nodes: GraphNode[]; edges: { source: string; target: string; type: string }[]; totalChildren: number; offset: number; nextOffset: number | null; truncated: boolean };
export type JsonLoader = <T>(path: string) => Promise<T>;
