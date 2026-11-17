<script setup lang="ts">
import { computed } from "vue";
import {
  Sparkles,
  Check,
  X,
  Trash2,
  Undo2,
  Redo2,
  AlertTriangle,
  CheckCheck,
} from "lucide-vue-next";
import type { PanelLink } from "../model/types";
const props = defineProps<{
  links: PanelLink[];
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  describe: (side: "original" | "redraft", id: string) => string;
}>();

const emit = defineEmits<{
  auto: [];
  accept: [id: string];
  reject: [id: string];
  remove: [id: string];
  acceptAll: [includeAmbiguous: boolean];
  undo: [];
  redo: [];
  focus: [link: PanelLink];
}>();

const pending = computed(() =>
  props.links.filter((l) => l.status === "suggested"),
);
const confirmed = computed(() =>
  props.links.filter((l) => l.status === "confirmed"),
);
const ambiguousPending = computed(() => pending.value.filter((l) => l.ambiguous));
</script>

<template>
  <section class="suggest-panel">
    <div class="section-heading">
      <span><Sparkles :size="14" /> 对应建议 <small>AUTO MATCH</small></span>
      <div class="history-btns">
        <button :disabled="!canUndo" title="撤销" @click="emit('undo')"><Undo2 :size="13" /></button>
        <button :disabled="!canRedo" title="重做" @click="emit('redo')"><Redo2 :size="13" /></button>
      </div>
    </div>

    <div class="suggest-actions">
      <button class="primary-btn" :disabled="busy" @click="emit('auto')">
        <Sparkles :size="13" /> 自动匹配建议
      </button>
      <button
        class="ghost-btn"
        :disabled="!pending.filter((l) => !l.ambiguous).length"
        @click="emit('acceptAll', false)"
      >
        <CheckCheck :size="13" /> 批量接受无歧义
      </button>
      <button
        class="ghost-btn"
        :disabled="!pending.length"
        @click="emit('acceptAll', true)"
      >
        全部接受
      </button>
    </div>
    <p class="hint-line">
      建议仅基于台词、说话人、声景与版面，不使用序号；确认前不会用于联动。
    </p>

    <div v-if="!links.length" class="empty-suggest">
      <AlertTriangle :size="20" />
      <p>还没有对应关系。先运行自动匹配，或在两侧点选分镜后“建立对应”。</p>
    </div>

    <div class="suggest-scroll">
      <article
        v-for="link in links"
        :key="link.id"
        class="suggest-item"
        :class="['is-' + link.status, { ambiguous: link.ambiguous && link.status === 'suggested' }]"
        @click="emit('focus', link)"
      >
        <div class="suggest-pair">
          <div class="pair-side">
            <small>原稿</small>
            <b v-for="id in link.originalPanelIds" :key="id">{{ describe("original", id) }}</b>
          </div>
          <span class="pair-arrow">⇄</span>
          <div class="pair-side">
            <small>重绘稿</small>
            <b v-for="id in link.redraftPanelIds" :key="id">{{ describe("redraft", id) }}</b>
          </div>
        </div>
        <div class="suggest-meta">
          <span class="confidence">置信度 {{ Math.round(link.confidence * 100) }}%</span>
          <span v-if="link.ambiguous && link.status !== 'rejected'" class="amb-flag">
            <AlertTriangle :size="11" /> 歧义
          </span>
          <span v-if="link.status === 'confirmed'" class="ok-flag"><Check :size="11" /> 已确认</span>
          <span v-if="link.status === 'rejected'" class="no-flag"><X :size="11" /> 已否决</span>
        </div>
        <ul class="reason-list">
          <li v-for="(r, i) in link.reasons.slice(0, 3)" :key="i">{{ r }}</li>
        </ul>
        <div class="suggest-row-btns" @click.stop>
          <template v-if="link.status === 'suggested'">
            <button class="mini accept" @click="emit('accept', link.id)"><Check :size="12" /> 接受</button>
            <button class="mini" @click="emit('reject', link.id)"><X :size="12" /> 否决</button>
          </template>
          <button class="mini danger" @click="emit('remove', link.id)"><Trash2 :size="12" /> 删除</button>
        </div>
      </article>
    </div>

    <div class="suggest-summary">
      <span>待确认 {{ pending.length }}</span>
      <span>歧义 {{ ambiguousPending.length }}</span>
      <span>已确认 {{ confirmed.length }}</span>
    </div>
  </section>
</template>
