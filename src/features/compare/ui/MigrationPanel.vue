<script setup lang="ts">
import { ref } from "vue";
import {
  Bookmark,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-vue-next";
import type {
  Bookmark as Mark,
  ReadingLocation,
} from "../../../shared/document";
import type { MigrationBatch, MigrationIssue } from "../model/types";
const props = defineProps<{
  sourceBookmarks: Mark[];
  redraftBookmarks: Mark[];
  migrations: MigrationBatch[];
  previewIssues: MigrationIssue[];
  buildPreview: () => MigrationIssue[];
}>();

const emit = defineEmits<{
  migrate: [];
  rollback: [batchId: string];
  openBookmark: [location: ReadingLocation];
}>();

const previewed = ref(false);
function runPreview() {
  props.buildPreview();
  previewed.value = true;
}
</script>

<template>
  <section class="migration-panel">
    <div class="section-heading">
      <span><Bookmark :size="14" /> 书签 / 进度迁移</span>
    </div>

    <p class="hint-line">
      仅迁移已确认对应的书签；迁移前列出歧义，回退只撤销本批次，新稿后加的书签不受影响。
    </p>

    <div class="migrate-actions">
      <button class="primary-btn" :disabled="!sourceBookmarks.length" @click="runPreview">
        预览迁移歧义
      </button>
      <button
        class="primary-btn solid"
        :disabled="!sourceBookmarks.length"
        @click="emit('migrate'); previewed = true"
      >
        迁移到新稿 <ArrowRight :size="13" />
      </button>
    </div>

    <div v-if="previewed" class="issue-box">
      <h4><AlertTriangle :size="13" /> 迁移前歧义 / 风险（{{ previewIssues.length }}）</h4>
      <p v-if="!previewIssues.length" class="all-clear">
        <CheckCircle2 :size="13" /> 所有书签都有唯一、已确认的对应。
      </p>
      <ul v-else>
        <li v-for="(issue, i) in previewIssues" :key="i" :class="'kind-' + issue.kind">
          <b>{{ issue.bookmark.label }}</b>
          <small>{{ issue.detail }}</small>
        </li>
      </ul>
    </div>

    <div class="migrate-lists">
      <div>
        <h5>原稿书签（{{ sourceBookmarks.length }}）</h5>
        <ul>
          <li v-for="bm in sourceBookmarks" :key="bm.id">
            <button @click="emit('openBookmark', bm.location)">{{ bm.label }}</button>
          </li>
          <li v-if="!sourceBookmarks.length" class="empty-li">暂无</li>
        </ul>
      </div>
      <div>
        <h5>新稿书签（{{ redraftBookmarks.length }}）</h5>
        <ul>
          <li v-for="bm in redraftBookmarks" :key="bm.id" :class="{ migrated: bm.label.includes('迁移') }">
            <button @click="emit('openBookmark', bm.location)">{{ bm.label }}</button>
          </li>
          <li v-if="!redraftBookmarks.length" class="empty-li">暂无</li>
        </ul>
      </div>
    </div>

    <div v-if="migrations.length" class="batch-list">
      <h5>迁移批次（可回退）</h5>
      <article v-for="batch in migrations" :key="batch.id" class="batch-item">
        <div>
          <b>{{ batch.note }}</b>
          <small>迁入 {{ batch.migratedBookmarkIds.length }} 条 · 跳过 {{ batch.skipped.length }} 条</small>
          <ul v-if="batch.skipped.length" class="skip-list">
            <li v-for="(s, i) in batch.skipped" :key="i">{{ s.label }}：{{ s.detail }}</li>
          </ul>
        </div>
        <button class="mini" @click="emit('rollback', batch.id)">
          <RotateCcw :size="12" /> 回退
        </button>
      </article>
    </div>
  </section>
</template>
