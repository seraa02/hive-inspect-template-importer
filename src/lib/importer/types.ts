export type ImportWarningLevel = "warning" | "error";

export interface ImportWarning {
  level: ImportWarningLevel;
  message: string;
  rowNumber?: number;
  section?: string;
  item?: string;
  comment?: string;
}

export interface ParsedComment {
  name: string;
  textHtml: string | null;
  commentType: string | null;
  severity: number | null;
  answerType: string | null;
  multipleChoiceOptions: string[] | null;
  unitTypeOptions: string[] | null;
  recommendation: string | null;
  defaultValue: string | null;
  position: number;
  sourceMetadata: Record<string, unknown> | null;
  sourceRowNumber: number;
}

export interface ParsedItem {
  name: string;
  position: number;
  comments: ParsedComment[];
}

export interface ParsedSection {
  name: string;
  position: number;
  items: ParsedItem[];
}

export interface ParsedTemplate {
  sections: ParsedSection[];
  stats: {
    sectionsCount: number;
    itemsCount: number;
    commentsCount: number;
    rowsRead: number;
  };
  warnings: ImportWarning[];
}
