import type { ComicDocument } from "../../../shared/document";
import type { FlatDoc, FlatPanel, Side } from "../model/types";

/** 把文档拍平为带章节/页归属的分镜序列；ordinal 仅用于界面展示 */
export function flatten(doc: ComicDocument, side: Side): FlatDoc {
  const panels: FlatPanel[] = [];
  let ordinal = 0;
  const chapters = doc.chapters.map((chapter, index) => ({
    index,
    chapter,
    pages: chapter.pages.map((page) => {
      const row = {
        page,
        panels: page.panels.map((panel) => {
          const flat: FlatPanel = {
            side,
            chapterIndex: index,
            chapter,
            page,
            panel,
            ordinal: ordinal++,
          };
          panels.push(flat);
          return flat;
        }),
      };
      return row;
    }),
  }));
  return { chapters, panels };
}

/** 中文按字符二元组切分，英文按小写词切分 */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  const clean = (text ?? "").replace(/\s+/g, "");
  const chars = [...clean];
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i]! + chars[i + 1]!);
  if (chars.length === 1) out.add(chars[0]!);
  for (const word of (text ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [])
    out.add(word);
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / (a.size + b.size - hit);
}

/** 相对裁切位置 / 形状的几何相似度，与“第几格”无关 */
export function geometrySimilarity(
  a: FlatPanel,
  b: FlatPanel,
): { score: number; reason: string | null } {
  const ra = a.panel.rect,
    rb = b.panel.rect,
    pa = a.page,
    pb = b.page;
  const ax = ra.x / pa.width,
    ay = ra.y / pa.height,
    aw = ra.width / pa.width,
    ah = ra.height / pa.height;
  const bx = rb.x / pb.width,
    by = rb.y / pb.height,
    bw = rb.width / pb.width,
    bh = rb.height / pb.height;
  const dist = Math.hypot(ax - bx, ay - by, aw - bw, ah - bh) / 2;
  const score = Math.max(0, 1 - dist);
  return {
    score,
    reason: score > 0.82 ? "版面位置与格子形状高度一致" : null,
  };
}
