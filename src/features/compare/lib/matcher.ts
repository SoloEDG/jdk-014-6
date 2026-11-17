import type { FlatPanel, PanelLink } from "../model/types";
import { geometrySimilarity, jaccard, tokens } from "./flatten";
import { makeId } from "../../../shared/commands";

export interface MatchCandidate {
  a: FlatPanel;
  b: FlatPanel;
  score: number;
  confidence: number;
  reasons: string[];
  ambiguous: boolean;
}

export interface MatchResult {
  suggestions: PanelLink[];
  /** 未得到任何建议的分镜（两侧），用于提示“暂时无对应” */
  unmatched: FlatPanel[];
  candidates: MatchCandidate[];
}

const HIGH = 0.5;

/**
 * 仅基于内容特征计算两个分镜的相似度。
 * 关键约束：绝不使用页序号 / 格序号作为身份或匹配依据，
 * 因此重排、增删格子、重新裁切都不会造成“同序号假对应”。
 */
export function scorePair(a: FlatPanel, b: FlatPanel): MatchCandidate {
  const reasons: string[] = [];
  const dialogue = jaccard(tokens(a.panel.dialogue), tokens(b.panel.dialogue));
  const speaker =
    a.panel.speaker && a.panel.speaker === b.panel.speaker ? 1 : 0;
  const sound = a.panel.sound === b.panel.sound ? 1 : 0;
  const geo = geometrySimilarity(a, b);

  const score =
    dialogue * 0.55 + geo.score * 0.25 + speaker * 0.12 + sound * 0.08;

  if (dialogue >= 0.5) reasons.push("台词文本高度重合");
  else if (dialogue >= 0.25) reasons.push("台词关键词重合");
  if (speaker) reasons.push(`说话人同为「${a.panel.speaker}」`);
  if (sound) reasons.push("声景类型一致");
  if (geo.reason) reasons.push(geo.reason);

  // 相似背景（雨夜/城市）容易只靠版面与声音误连：
  // 缺少文本证据时强制降置信度并标记歧义，交给人工确认。
  const weakText = dialogue < 0.25;
  const ambiguous = weakText || score < 0.74;
  const confidence = Math.min(
    0.97,
    weakText ? Math.min(score, 0.55) : score,
  );

  return { a, b, score, confidence, reasons, ambiguous };
}

/** 章节内贪心一对一，给出建议（status=suggested，联动阅读不采用） */
export function runAutoMatch(
  original: FlatPanel[],
  redraft: FlatPanel[],
): MatchResult {
  const candidates: MatchCandidate[] = [];
  const chapterCount = Math.max(
    ...original.map((p) => p.chapterIndex),
    ...redraft.map((p) => p.chapterIndex),
    0,
  ) + 1;

  for (let ci = 0; ci < chapterCount; ci++) {
    const left = original.filter((p) => p.chapterIndex === ci);
    const right = redraft.filter((p) => p.chapterIndex === ci);
    type Row = MatchCandidate & { runnerUp: number };
    const rows: Row[] = [];
    for (const a of left) {
      const scored = right
        .map((b) => scorePair(a, b))
        .sort((x, y) => y.score - x.score);
      const best = scored[0];
      if (!best) continue;
      const runnerUp = scored[1]?.score ?? 0;
      rows.push({
        ...best,
        ambiguous:
          best.ambiguous || best.score - runnerUp < 0.08,
        runnerUp,
      });
    }
    // 按分数降序贪心，保证每个分镜至多进入一条建议
    rows.sort((x, y) => y.score - x.score);
    const usedL = new Set<string>(),
      usedR = new Set<string>();
    for (const row of rows) {
      if (row.score < HIGH) continue;
      if (usedL.has(row.a.panel.id) || usedR.has(row.b.panel.id)) continue;
      usedL.add(row.a.panel.id);
      usedR.add(row.b.panel.id);
      candidates.push(row);
    }
  }

  const matchedL = new Set(candidates.map((c) => c.a.panel.id));
  const matchedR = new Set(candidates.map((c) => c.b.panel.id));
  const unmatched = [
    ...original.filter((p) => !matchedL.has(p.panel.id)),
    ...redraft.filter((p) => !matchedR.has(p.panel.id)),
  ];

  const now = Date.now();
  const suggestions: PanelLink[] = candidates.map((c, i) => ({
    id: makeId("link"),
    chapterIndex: c.a.chapterIndex,
    originalPanelIds: [c.a.panel.id],
    redraftPanelIds: [c.b.panel.id],
    confidence: Math.round(c.confidence * 100) / 100,
    status: "suggested",
    reasons: c.reasons.length ? c.reasons : ["综合画面与版面特征"],
    ambiguous: c.ambiguous,
    created: now + i,
  }));

  return { suggestions, unmatched, candidates };
}
