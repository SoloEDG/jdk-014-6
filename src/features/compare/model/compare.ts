import { computed, ref, shallowRef } from "vue";
import type {
  Bookmark,
  ComicDocument,
  ReadingLocation,
} from "../../../shared/document";
import { makeId } from "../../../shared/commands";
import type {
  CompareSession,
  FlatDoc,
  FlatPanel,
  MigrationBatch,
  MigrationIssue,
  PanelLink,
  Side,
} from "./types";
import { flatten } from "../lib/flatten";
import { runAutoMatch, scorePair } from "../lib/matcher";
import {
  loadCompareSession,
  saveCompareSession,
} from "../lib/persistence";

interface HistoryEntry {
  links: PanelLink[];
  label: string;
}

export function useCompare(original: ComicDocument, redraft: ComicDocument) {
  const persisted = loadCompareSession(original.id, redraft.id);
  const links = ref<PanelLink[]>(
    persisted && persisted.links.length ? persisted.links : [],
  );
  const migrations = ref<MigrationBatch[]>(persisted?.migrations ?? []);
  const flatOriginal = shallowRef<FlatDoc>(flatten(original, "original"));
  const flatRedraft = shallowRef<FlatDoc>(flatten(redraft, "redraft"));
  const busy = ref(false);
  const notice = ref("");
  const activeSide = ref<Side>("original");

  // ---- 撤销 / 重做：仅针对对应关系编辑 ----
  const past = ref<HistoryEntry[]>([]);
  const future = ref<HistoryEntry[]>([]);
  function snapshot(label: string) {
    past.value.push({
      links: JSON.parse(JSON.stringify(links.value)) as PanelLink[],
      label,
    });
    if (past.value.length > 40) past.value.shift();
    future.value = [];
  }
  function undo() {
    const prev = past.value.pop();
    if (!prev) return;
    future.value.push({
      links: JSON.parse(JSON.stringify(links.value)) as PanelLink[],
      label: prev.label,
    });
    links.value = prev.links;
    notice.value = `已撤销：${prev.label}`;
    persist();
  }
  function redo() {
    const next = future.value.pop();
    if (!next) return;
    past.value.push({
      links: JSON.parse(JSON.stringify(links.value)) as PanelLink[],
      label: next.label,
    });
    links.value = next.links;
    notice.value = `已重做：${next.label}`;
    persist();
  }

  const flatOf = (side: Side): FlatDoc =>
    side === "original" ? flatOriginal.value : flatRedraft.value;

  // ---- 查询：某分镜当前所属的链接 ----
  function linkOf(side: Side, panelId: string): PanelLink | undefined {
    const key = side === "original" ? "originalPanelIds" : "redraftPanelIds";
    return links.value.find((l) => l[key].includes(panelId));
  }

  const confirmedLinks = computed(() =>
    links.value.filter((l) => l.status === "confirmed"),
  );
  const suggestedLinks = computed(() =>
    links.value.filter((l) => l.status === "suggested"),
  );
  const rejectedCount = computed(
    () => links.value.filter((l) => l.status === "rejected").length,
  );

  const stats = computed(() => {
    const total =
      flatOriginal.value.panels.length + flatRedraft.value.panels.length;
    const covered = new Set<string>();
    for (const l of confirmedLinks.value) {
      l.originalPanelIds.forEach((id) => covered.add("o:" + id));
      l.redraftPanelIds.forEach((id) => covered.add("r:" + id));
    }
    return {
      total,
      covered: covered.size,
      confirmed: confirmedLinks.value.length,
      suggested: suggestedLinks.value.length,
      rejected: rejectedCount.value,
      percent: Math.round((covered.size / Math.max(1, total)) * 100),
    };
  });

  // ---- 自动匹配（建议态，绝不直接当成可信关联）----
  async function autoMatch() {
    busy.value = true;
    notice.value = "正在基于台词、说话人与版面生成建议…";
    await new Promise((r) => setTimeout(r, 120));
    const result = runAutoMatch(
      flatOriginal.value.panels,
      flatRedraft.value.panels,
    );
    snapshot("自动匹配");
    // 清掉旧的建议/被否记录，保留已确认的人工关联
    links.value = [
      ...links.value.filter((l) => l.status === "confirmed"),
      ...result.suggestions,
    ];
    notice.value = `生成 ${result.suggestions.length} 条建议，其中 ${result.suggestions.filter((l) => l.ambiguous).length} 条存在歧义待确认；未匹配分镜 ${result.unmatched.length} 个`;
    busy.value = false;
    persist();
  }

  function accept(linkId: string) {
    const l = links.value.find((x) => x.id === linkId);
    if (!l || l.status === "confirmed") return;
    snapshot("接受建议");
    l.status = "confirmed";
    l.confidence = 1;
    links.value = [...links.value];
    notice.value = "已确认对应，联动阅读将在此跳转";
    persist();
  }

  function reject(linkId: string) {
    const l = links.value.find((x) => x.id === linkId);
    if (!l) return;
    snapshot("否决建议");
    l.status = "rejected";
    links.value = [...links.value];
    notice.value = "已否决，该建议不会用于联动";
    persist();
  }

  function removeLink(linkId: string) {
    snapshot("删除对应");
    links.value = links.value.filter((l) => l.id !== linkId);
    notice.value = "对应关系已删除，两侧分镜恢复无对应";
    persist();
  }

  /** 批量接受所有非歧义建议；歧义项保留待人工判断 */
  function acceptAll(includeAmbiguous = false) {
    const targets = links.value.filter(
      (l) =>
        l.status === "suggested" &&
        (includeAmbiguous || !l.ambiguous),
    );
    if (!targets.length) {
      notice.value = includeAmbiguous
        ? "没有待接受的建议"
        : "没有无歧义建议；歧义项需逐条确认";
      return;
    }
    snapshot("批量接受建议");
    for (const l of targets) {
      l.status = "confirmed";
      l.confidence = 1;
    }
    links.value = [...links.value];
    notice.value = `已批量确认 ${targets.length} 条对应${includeAmbiguous ? "（含歧义）" : ""}`;
    persist();
  }

  /**
   * 人工建立 / 合并对应。支持一格对多格：
   * 若任一分镜已属于某条已确认关联，则并入该关联（两侧都允许追加）。
   */
  function createLink(
    side: Side,
    panelId: string,
    oppositePanelId: string,
  ): PanelLink | null {
    const a = findPanel("original", side === "original" ? panelId : oppositePanelId);
    const b = findPanel("redraft", side === "redraft" ? panelId : oppositePanelId);
    if (!a || !b) return null;
    if (a.chapterIndex !== b.chapterIndex) {
      notice.value = "跨章节的分镜不能建立对应";
      return null;
    }
    const existingA = linkOf("original", a.panel.id);
    const existingB = linkOf("redraft", b.panel.id);
    const existing =
      existingA?.status === "confirmed"
        ? existingA
        : existingB?.status === "confirmed"
          ? existingB
          : undefined;
    snapshot("建立对应");
    if (existing) {
      mergeInto(existing, a, b);
      notice.value = "已并入现有对应（支持一格对多格）";
      links.value = [...links.value];
      persist();
      return existing;
    }
    const candidate = scorePair(a, b);
    const link: PanelLink = {
      id: makeId("link"),
      chapterIndex: a.chapterIndex,
      originalPanelIds: [a.panel.id],
      redraftPanelIds: [b.panel.id],
      confidence: 1,
      status: "confirmed",
      reasons: ["人工确认", ...candidate.reasons],
      ambiguous: false,
      created: Date.now(),
    };
    links.value = [...links.value, link];
    notice.value = "已建立人工对应";
    persist();
    return link;
  }

  function mergeInto(link: PanelLink, a: FlatPanel, b: FlatPanel) {
    if (!link.originalPanelIds.includes(a.panel.id))
      link.originalPanelIds.push(a.panel.id);
    if (!link.redraftPanelIds.includes(b.panel.id))
      link.redraftPanelIds.push(b.panel.id);
    link.ambiguous = false;
  }

  function findPanel(side: Side, panelId: string): FlatPanel | undefined {
    return flatOf(side).panels.find((p) => p.panel.id === panelId);
  }

  // ---- 联动阅读：只在已确认关联处跳转，无对应则停在原处并提示 ----
  function jumpAcross(
    side: Side,
    panelId: string,
  ): { side: Side; location: ReadingLocation } | null {
    const link = linkOf(side, panelId);
    if (!link || link.status !== "confirmed") {
      notice.value = "该分镜尚无已确认对应，已保留在当前版本";
      return null;
    }
    const targetSide: Side = side === "original" ? "redraft" : "original";
    const ids =
      targetSide === "redraft"
        ? link.redraftPanelIds
        : link.originalPanelIds;
    const target = findPanel(targetSide, ids[0]!);
    if (!target) return null;
    activeSide.value = targetSide;
    notice.value = `已联动到${targetSide === "redraft" ? "重绘稿" : "原稿"}对应分镜`;
    return {
      side: targetSide,
      location: {
        chapterId: target.chapter.id,
        pageId: target.page.id,
        panelId: target.panel.id,
        zoom: 1,
        x: 0,
        y: 0,
      },
    };
  }

  // ---- 书签 / 进度迁移：迁移前列歧义，回退不破坏新稿新书签 ----
  function previewMigration(
    sourceBookmarks: Bookmark[],
  ): MigrationIssue[] {
    const issues: MigrationIssue[] = [];
    for (const bm of sourceBookmarks) {
      const link = linkOf("original", bm.location.panelId);
      if (!link || link.status !== "confirmed") {
        issues.push({
          bookmark: bm,
          kind: "no-link",
          detail: "原稿分镜尚无已确认对应，无法定位到新稿",
        });
        continue;
      }
      if (link.ambiguous) {
        issues.push({
          bookmark: bm,
          kind: "ambiguous",
          detail: "对应关系被标记为歧义，迁移后请人工复核",
        });
      }
      if (link.redraftPanelIds.length > 1) {
        issues.push({
          bookmark: bm,
          kind: "multi-target",
          detail: `一格对多格（${link.redraftPanelIds.length} 个候选），将落到首个分镜`,
        });
      }
    }
    return issues;
  }

  function migrate(
    sourceBookmarks: Bookmark[],
    currentRedraftLocation: ReadingLocation | null,
  ): { batch: MigrationBatch; added: Bookmark[] } {
    const issues = previewMigration(sourceBookmarks);
    const skipped = issues
      .filter((i) => i.kind === "no-link")
      .map((i) => ({
        label: i.bookmark.label,
        reason: "no-link" as const,
        detail: i.detail,
      }));
    const added: Bookmark[] = [];
    const batch: MigrationBatch = {
      id: makeId("migration"),
      created: Date.now(),
      migratedBookmarkIds: [],
      previousLocation: currentRedraftLocation
        ? { ...currentRedraftLocation }
        : null,
      skipped,
      note: `迁移 ${sourceBookmarks.length - skipped.length} 条，跳过 ${skipped.length} 条；歧义 ${issues.filter((i) => i.kind === "ambiguous" || i.kind === "multi-target").length} 条`,
    };
    for (const bm of sourceBookmarks) {
      const link = linkOf("original", bm.location.panelId);
      if (!link || link.status !== "confirmed") continue;
      const target = findPanel("redraft", link.redraftPanelIds[0]!);
      if (!target) continue;
      const nb: Bookmark = {
        id: makeId("bookmark"),
        label: `${bm.label}（迁移）`,
        created: Date.now(),
        location: {
          chapterId: target.chapter.id,
          pageId: target.page.id,
          panelId: target.panel.id,
          zoom: 1,
          x: 0,
          y: 0,
        },
      };
      added.push(nb);
      batch.migratedBookmarkIds.push(nb.id);
    }
    migrations.value = [...migrations.value, batch];
    notice.value = batch.note;
    persist();
    return { batch, added };
  }

  /**
   * 回退迁移：仅删除该批次迁入的书签 id。
   * 新稿中后来手工新增的书签 id 不在批次清单内，因此绝不会被删除。
   */
  function rollback(
    batchId: string,
  ): { removedIds: string[]; location: ReadingLocation | null } {
    const batch = migrations.value.find((m) => m.id === batchId);
    if (!batch) return { removedIds: [], location: null };
    migrations.value = migrations.value.filter((m) => m.id !== batchId);
    notice.value = "已回退迁移；新稿后加的书签保持不变，两份原稿均保留";
    persist();
    return {
      removedIds: [...batch.migratedBookmarkIds],
      location: batch.previousLocation,
    };
  }

  function persist() {
    const session: CompareSession = {
      original,
      redraft,
      links: links.value,
      migrations: migrations.value,
      updatedAt: Date.now(),
    };
    notice.value = saveCompareSession(session)
      ? notice.value || "对应关系已保存到本地"
      : "存储空间不足，本次修改仅保留在当前页面";
  }

  return {
    original,
    redraft,
    flatOriginal,
    flatRedraft,
    links,
    migrations,
    stats,
    busy,
    notice,
    activeSide,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    linkOf,
    autoMatch,
    accept,
    reject,
    removeLink,
    acceptAll,
    createLink,
    jumpAcross,
    previewMigration,
    migrate,
    rollback,
    undo,
    redo,
    findPanel,
  };
}

export type CompareStore = ReturnType<typeof useCompare>;
