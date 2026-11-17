<script setup lang="ts">
import { computed } from "vue";
import { Link2, Unlink, ArrowRightLeft, Volume2 } from "lucide-vue-next";
import type { ComicPage, Panel } from "../../../shared/document";
import type { PanelLink, Side } from "../model/types";

const props = defineProps<{
  side: Side;
  title: string;
  chapterTitle: string;
  page: ComicPage;
  pageIndex: number;
  pageCount: number;
  activePanelId: string;
  isMaster: boolean;
  linkOfPanel: (panelId: string) => PanelLink | undefined;
  canLink: boolean;
}>();

const emit = defineEmits<{
  selectPanel: [id: string];
  jump: [panelId: string];
  link: [panelId: string];
  prevPage: [];
  nextPage: [];
}>();

function box(panel: Panel) {
  return {
    left: `${(panel.rect.x / props.page.width) * 100}%`,
    top: `${(panel.rect.y / props.page.height) * 100}%`,
    width: `${(panel.rect.width / props.page.width) * 100}%`,
    height: `${(panel.rect.height / props.page.height) * 100}%`,
  };
}

function stateOf(panel: Panel): "confirmed" | "suggested" | "rejected" | "none" {
  const l = props.linkOfPanel(panel.id);
  if (!l) return "none";
  return l.status;
}

const activeLink = computed(() =>
  props.linkOfPanel(props.activePanelId),
);
</script>

<template>
  <section class="compare-pane" :class="{ master: isMaster }">
    <header class="pane-head">
      <div>
        <span class="pane-tag">
          {{ side === "original" ? "原稿 ORIGINAL" : "重绘稿 REDRAFT" }}
        </span>
        <h3>{{ title }}</h3>
        <small>{{ chapterTitle }}</small>
      </div>
      <div class="pane-badges">
        <span v-if="isMaster" class="master-badge"><Volume2 :size="11" /> 主读·声源</span>
        <span class="page-badge">{{ pageIndex + 1 }}/{{ pageCount }} 页</span>
      </div>
    </header>

    <div class="pane-stage">
      <button class="page-arrow" :disabled="pageIndex === 0" @click="emit('prevPage')">‹</button>
      <div class="pane-frame">
        <img :src="page.image" :alt="page.title" draggable="false" />
        <button
          v-for="(panel, i) in page.panels"
          :key="panel.id"
          class="cell"
          :class="['state-' + stateOf(panel), { active: activePanelId === panel.id }]"
          :style="box(panel)"
          @click="emit('selectPanel', panel.id)"
        >
          <span class="cell-no">{{ String(i + 1).padStart(2, "0") }}</span>
          <span class="cell-state">
            <template v-if="stateOf(panel) === 'confirmed'"><Link2 :size="11" /></template>
            <template v-else-if="stateOf(panel) === 'suggested'">待确认</template>
            <template v-else-if="stateOf(panel) === 'rejected'"><Unlink :size="11" /></template>
            <template v-else>无对应</template>
          </span>
        </button>
      </div>
      <button class="page-arrow" :disabled="pageIndex >= pageCount - 1" @click="emit('nextPage')">›</button>
    </div>

    <div class="pane-panel-info">
      <div>
        <strong>{{ page.panels.find((p) => p.id === activePanelId)?.dialogue ?? "请选择分镜" }}</strong>
        <small>
          说话人：{{ page.panels.find((p) => p.id === activePanelId)?.speaker ?? "—" }}
          · 声景：{{ page.panels.find((p) => p.id === activePanelId)?.sound ?? "—" }}
        </small>
      </div>
      <div class="pane-actions">
        <button
          class="ghost-btn"
          :disabled="!canLink"
          title="与对侧当前选中分镜建立对应"
          @click="emit('link', activePanelId)"
        >
          <Link2 :size="13" /> 建立对应
        </button>
        <button
          class="ghost-btn"
          :disabled="!activeLink || activeLink.status !== 'confirmed'"
          title="仅在已确认关联处联跳到对侧"
          @click="emit('jump', activePanelId)"
        >
          <ArrowRightLeft :size="13" /> 联跳
        </button>
      </div>
    </div>
  </section>
</template>
