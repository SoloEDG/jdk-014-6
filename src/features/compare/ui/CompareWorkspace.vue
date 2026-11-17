<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Columns2,
  ArrowLeft,
  Volume2,
  Info,
} from "lucide-vue-next";
import type {
  ComicDocument,
  ReadingLocation,
} from "../../../shared/document";
import { useReader } from "../../reader";
import { useAudio } from "../../audio";
import { useCompare } from "../model/compare";
import type { PanelLink, Side } from "../model/types";
import ComparePane from "./ComparePane.vue";
import SuggestionPanel from "./SuggestionPanel.vue";
import MigrationPanel from "./MigrationPanel.vue";
import "./compare.css";

const props = defineProps<{
  original: ComicDocument;
  redraft: ComicDocument;
  /** 原稿书签（来自沉浸阅读进度） */
  originalBookmarks: import("../../../shared/document").Bookmark[];
}>();
const emit = defineEmits<{
  exit: [];
  /** 把迁移产生的书签交给外层合并进新稿 */
  addMigrated: [marks: import("../../../shared/document").Bookmark[]];
  /** 回退时由外层删除批次书签 */
  removeMigrated: [ids: string[]];
}>();

const store = useCompare(props.original, props.redraft);
const readerO = useReader(ref(props.original));
const readerR = useReader(ref(props.redraft));

const readers = {
  original: readerO,
  redraft: readerR,
};
const docs = { original: props.original, redraft: props.redraft };

const master = ref<Side>("original");
const redraftBookmarks = ref<import("../../../shared/document").Bookmark[]>([]);
const issues = ref(store.previewMigration(props.originalBookmarks));

// 声源只来自当前主读版本
const masterPanel = computed(
  () => readers[master.value].current.value.panel,
);
const audio = useAudio(masterPanel);

function readerOf(side: Side) {
  return readers[side];
}
function pageState(side: Side) {
  const r = readerOf(side);
  const doc = docs[side];
  const chapter = r.current.value.chapter ?? doc.chapters[0]!;
  const page = r.current.value.page ?? chapter.pages[0]!;
  const pageIndex = chapter.pages.findIndex((p) => p.id === page.id);
  return { chapter, page, pageIndex, pageCount: chapter.pages.length };
}

function selectPanel(side: Side, panelId: string) {
  readerOf(side).dispatch({ type: "panel", id: panelId });
}
function flipPage(side: Side, delta: number) {
  const r = readerOf(side);
  const { chapter, pageIndex } = pageState(side);
  const target = chapter.pages[pageIndex + delta];
  if (!target) return;
  r.dispatch({ type: "panel", id: target.panels[0]!.id });
}

function setMaster(side: Side) {
  master.value = side;
  store.activeSide.value = side;
}

/** 手动建立对应：用两侧当前选中分镜 */
function linkCurrent(side: Side) {
  const opposite: Side = side === "original" ? "redraft" : "original";
  const a = readerOf(side).location.value.panelId;
  const b = readerOf(opposite).location.value.panelId;
  store.createLink(side, a, b);
}

/** 联动阅读：仅在 confirmed 关联处跳转，否则停留并提示 */
function jump(side: Side, panelId: string) {
  const result = store.jumpAcross(side, panelId);
  if (!result) return;
  readerOf(result.side).dispatch({ type: "restore", location: result.location });
  setMaster(result.side);
}

function describe(side: Side, panelId: string): string {
  const flat = store.findPanel(side, panelId);
  if (!flat) return panelId;
  const pageNo = flat.chapter.pages.findIndex((p) => p.id === flat.page.id) + 1;
  const cellNo = flat.page.panels.findIndex((p) => p.id === panelId) + 1;
  const text = flat.panel.dialogue.slice(0, 12);
  return `P${pageNo}·格${cellNo} ${text}…`;
}

function focusLink(link: PanelLink) {
  const side: Side = "original";
  const id = link.originalPanelIds[0]!;
  const flat = store.findPanel(side, id);
  if (flat)
    readerOf(side).dispatch({ type: "panel", id });
  const rid = link.redraftPanelIds[0]!;
  const rflat = store.findPanel("redraft", rid);
  if (rflat)
    readerOf("redraft").dispatch({ type: "panel", id: rid });
}

function buildPreview() {
  issues.value = store.previewMigration(props.originalBookmarks);
  return issues.value;
}

function doMigrate() {
  const { added } = store.migrate(
    props.originalBookmarks,
    readerR.location.value,
  );
  redraftBookmarks.value = [...redraftBookmarks.value, ...added];
  emit("addMigrated", added);
  buildPreview();
}

function doRollback(batchId: string) {
  const { removedIds, location } = store.rollback(batchId);
  redraftBookmarks.value = redraftBookmarks.value.filter(
    (b) => !removedIds.includes(b.id),
  );
  emit("removeMigrated", removedIds);
  if (location) readerR.dispatch({ type: "restore", location });
}

function openAt(location: ReadingLocation) {
  // 原稿书签在原稿侧打开；新稿书签在新稿侧打开
  const inRedraft = docs.redraft.chapters.some((c) =>
    c.pages.some((p) => p.id === location.pageId),
  );
  readerOf(inRedraft ? "redraft" : "original").dispatch({
    type: "restore",
    location,
  });
}

const stats = store.stats;
</script>

<template>
  <div class="compare-shell">
    <header class="compare-header">
      <button class="ghost-btn exit-btn" @click="emit('exit')">
        <ArrowLeft :size="14" /> 返回沉浸阅读
      </button>
      <div class="compare-title">
        <Columns2 :size="16" />
        <h2>双版本对照工作台</h2>
        <span class="compare-sub">同剧情分镜对应 · 联动仅走已确认关联</span>
      </div>
      <div class="master-switch">
        <span><Volume2 :size="13" /> 声源（主读）：</span>
        <button
          :class="{ on: master === 'original' }"
          @click="setMaster('original')"
        >原稿</button>
        <button
          :class="{ on: master === 'redraft' }"
          @click="setMaster('redraft')"
        >重绘稿</button>
      </div>
    </header>

    <div class="compare-statbar">
      <span>已确认对应 <b>{{ stats.confirmed }}</b></span>
      <span>待确认建议 <b>{{ stats.suggested }}</b></span>
      <span>覆盖率 <b>{{ stats.percent }}%</b></span>
      <span v-if="store.notice.value" class="notice-pill"><Info :size="12" />{{ store.notice.value }}</span>
      <button
        class="ghost-btn sound-toggle"
        :class="{ playing: audio.enabled.value }"
        @click="audio.toggle()"
      >
        <Volume2 :size="13" /> {{ audio.enabled.value ? "关闭主读声景" : "播放主读声景" }}
      </button>
    </div>

    <div class="compare-grid">
      <div class="panes-row">
        <div class="pane-wrap" :class="{ master: master === 'original' }" @click="setMaster('original')">
          <ComparePane
            side="original"
            :title="original.title"
            :chapter-title="pageState('original').chapter.title"
            :page="pageState('original').page"
            :page-index="pageState('original').pageIndex"
            :page-count="pageState('original').pageCount"
            :active-panel-id="readerO.location.value.panelId"
            :is-master="master === 'original'"
            :link-of-panel="(id) => store.linkOf('original', id)"
            :can-link="true"
            @select-panel="(id) => selectPanel('original', id)"
            @jump="(id) => jump('original', id)"
            @link="linkCurrent('original')"
            @prev-page="flipPage('original', -1)"
            @next-page="flipPage('original', 1)"
          />
        </div>
        <div class="pane-wrap" :class="{ master: master === 'redraft' }" @click="setMaster('redraft')">
          <ComparePane
            side="redraft"
            :title="redraft.title"
            :chapter-title="pageState('redraft').chapter.title"
            :page="pageState('redraft').page"
            :page-index="pageState('redraft').pageIndex"
            :page-count="pageState('redraft').pageCount"
            :active-panel-id="readerR.location.value.panelId"
            :is-master="master === 'redraft'"
            :link-of-panel="(id) => store.linkOf('redraft', id)"
            :can-link="true"
            @select-panel="(id) => selectPanel('redraft', id)"
            @jump="(id) => jump('redraft', id)"
            @link="linkCurrent('redraft')"
            @prev-page="flipPage('redraft', -1)"
            @next-page="flipPage('redraft', 1)"
          />
        </div>
      </div>

      <div class="side-column">
        <SuggestionPanel
          :links="store.links.value"
          :can-undo="store.canUndo.value"
          :can-redo="store.canRedo.value"
          :busy="store.busy.value"
          :describe="describe"
          @auto="store.autoMatch"
          @accept="store.accept"
          @reject="store.reject"
          @remove="store.removeLink"
          @accept-all="store.acceptAll"
          @undo="store.undo"
          @redo="store.redo"
          @focus="focusLink"
        />
        <MigrationPanel
          :source-bookmarks="originalBookmarks"
          :redraft-bookmarks="redraftBookmarks"
          :migrations="store.migrations.value"
          :preview-issues="issues"
          :build-preview="buildPreview"
          @migrate="doMigrate"
          @rollback="doRollback"
          @open-bookmark="openAt"
        />
      </div>
    </div>
  </div>
</template>
