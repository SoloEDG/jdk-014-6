import type {
  Bookmark,
  Chapter,
  ComicDocument,
  ComicPage,
  Panel,
  ReadingLocation,
} from "../../../shared/document";

/** 对照工作区的两侧：原稿与重绘稿 */
export type Side = "original" | "redraft";

/**
 * 分镜（格子）级对应。
 * 允许一格对应多格：同一剧情可在两侧各有若干 panel。
 * status:
 *  - suggested 自动匹配产生的建议，尚未人工确认，联动阅读不会采用
 *  - confirmed 人工确认（或人工新建/批量接受）后的可信关联
 *  - rejected  被否决的建议（保留记录，避免再次推荐）
 */
export type LinkStatus = "suggested" | "confirmed" | "rejected";

export interface PanelLink {
  id: string;
  chapterIndex: number;
  originalPanelIds: string[];
  redraftPanelIds: string[];
  /** 自动匹配给出的 0~1 置信度；人工新建的关联为 1 */
  confidence: number;
  status: LinkStatus;
  /** 命中的依据，用于界面解释“为什么推荐这一对” */
  reasons: string[];
  /** 是否存在多个难分高下的候选，即歧义关联 */
  ambiguous: boolean;
  created: number;
}

/** 页级对应（由分镜对应聚合而来，也可独立查看） */
export interface PagePair {
  chapterIndex: number;
  originalPageId: string | null;
  redraftPageId: string | null;
  linkIds: string[];
  /** 该页是否存在分镜无对应 */
  hasUnmatched: boolean;
}

export interface FlatPanel {
  side: Side;
  chapterIndex: number;
  chapter: Chapter;
  page: ComicPage;
  panel: Panel;
  /** 在所属文档中的全局序号（仅用于展示，绝不作为匹配依据） */
  ordinal: number;
}

export interface CompareSession {
  original: ComicDocument;
  redraft: ComicDocument;
  links: PanelLink[];
  /** 迁移批次记录，支撑安全回退 */
  migrations: MigrationBatch[];
  updatedAt: number;
}

/**
 * 书签 / 进度迁移批次。
 * 回退时只删除本批次新增到新稿的书签，绝不触碰后来手工新增的书签。
 */
export interface MigrationBatch {
  id: string;
  created: number;
  /** 从原稿迁来、在新稿中新建的书签 id */
  migratedBookmarkIds: string[];
  /** 迁移前的新稿阅读位置，回退时恢复 */
  previousLocation: ReadingLocation | null;
  /** 迁移时跳过（存在歧义/无对应）的条目说明 */
  skipped: MigrationSkip[];
  note: string;
}

export interface MigrationSkip {
  label: string;
  reason: "no-link" | "ambiguous" | "unconfirmed";
  detail: string;
}

/** 迁移前列出的歧义 / 风险条目 */
export interface MigrationIssue {
  bookmark: Bookmark;
  kind: "no-link" | "ambiguous" | "unconfirmed" | "multi-target";
  detail: string;
}

export interface FlatDoc {
  chapters: {
    index: number;
    chapter: Chapter;
    pages: { page: ComicPage; panels: FlatPanel[] }[];
  }[];
  panels: FlatPanel[];
}
