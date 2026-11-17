import type { ComicDocument, Panel, Rect } from "../../../shared/document";
import { artwork } from "../../library/lib/artwork";

/**
 * 构造“重绘稿”：与原稿是同一个故事，但
 *  - 每章页数不同（原稿 4/3/3 页 → 重绘 3/2/2 页）
 *  - 裁切尺寸不同（960x1280）
 *  - 每页格子数不同：存在拆格（1→2）、合并格（2→1）与无对应新增格
 * 对应只能靠台词/说话人/画面内容，不能靠序号。
 */
export function redraftDocument(source: ComicDocument): ComicDocument {
  // 每个章节内部重排，刻意打乱格序、改变页/格数量
  const groups: string[][][] = [
    [
      // 第 1 章：合并格（原稿前两句合一）+ 新增无对应格
      [
        "整座城市都在等待一场不会停的雨。末班车已经走了，你还在等谁？",
        "一封没有署名的消息，在凌晨两点亮起。",
        "【重绘新增】镜头扫过积水的街道，霓虹灯碎成一片。",
      ],
      // 拆格：原稿第 4 句拆成两个镜头
      ["沿着光走。", "我们在旧车站见。"],
      // 整页都是重绘新增的过场（无对应）
      ["【重绘新增】雨幕中，一列空车缓缓进站。"],
    ],
    [
      // 第 2 章：2 页
      ["街灯把影子拉得很长。", "我记得这里，曾经有一间唱片店。"],
      // 合并格：原稿后两句合一
      ["有人比我更早抵达。雨声里，传来一首熟悉的歌。"],
    ],
    [
      // 第 3 章：合并格 + 常规格
      ["城市的边缘，终于亮起一线微光。原来你一直都在。", "那封信，是写给昨天的自己。"],
      // 常规格 + 重绘尾声新增格
      ["天亮了。我们出发吧。", "【重绘新增】站台尽头，新一班车亮起了灯。"],
    ],
  ];

  // 说话人推断：完整相等优先，其次按包含关系（拆格/合格）
  const sourcePanels = source.chapters.flatMap((c) =>
    c.pages.flatMap((p) => p.panels),
  );
  function speakerOf(line: string, fallbackIndex: number): string {
    const exact = sourcePanels.find((p) => p.dialogue === line);
    if (exact) return exact.speaker;
    const contained = sourcePanels.find(
      (p) => line.includes(p.dialogue) || p.dialogue.includes(line),
    );
    if (contained) return contained.speaker;
    return fallbackIndex % 2 ? "陈屿" : "旁白";
  }

  const rects3: Rect[] = [
    { x: 10, y: 10, width: 940, height: 600 },
    { x: 10, y: 628, width: 460, height: 330 },
    { x: 486, y: 628, width: 464, height: 330 },
  ];
  const rects2: Rect[] = [
    { x: 10, y: 10, width: 940, height: 620 },
    { x: 10, y: 648, width: 940, height: 310 },
  ];
  const rects1: Rect[] = [{ x: 10, y: 10, width: 940, height: 940 }];

  function rectsFor(n: number): Rect[] {
    if (n === 3) return rects3;
    if (n === 2) return rects2;
    return rects1;
  }

  return {
    version: 1,
    id: `${source.id}-redraft`,
    title: `${source.title} · 重绘版`,
    author: source.author,
    chapters: groups.map((pages, c) => ({
      id: `redraft-chapter-${c}`,
      title: source.chapters[c]?.title ?? `第 ${c + 1} 章`,
      subtitle: source.chapters[c]?.subtitle ?? "",
      pages: pages.map((lines, p) => {
        const rects = rectsFor(lines.length);
        const panels: Panel[] = lines.map((dialogue, i) => ({
          id: `redraft-panel-${c}-${p}-${i}`,
          dialogue,
          speaker: speakerOf(dialogue, i),
          sound: i === 1 ? "pulse" : c === 2 ? "wind" : "rain",
          duration: 4 + i,
          rect: rects[i]!,
        }));
        return {
          id: `redraft-page-${c}-${p}`,
          title: `重绘 第 ${p + 1} 页`,
          width: 960,
          height: 1280,
          image: artwork(c * 3 + p + 1),
          panels,
        };
      }),
    })),
  };
}
