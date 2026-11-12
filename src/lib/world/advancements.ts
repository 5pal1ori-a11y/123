import type { TextureName } from "@/lib/island/textures";

/**
 * 도전 과제 — 보상 없이 기록만 남는다.
 * server: 서버가 직접 확인하고 달성 처리 / client: 월드에서 일어난 일을 클라이언트가 알려 준다.
 */
export const ADVANCEMENTS = [
  { id: "welcome", title: "어서 와, DOES MC!", desc: "월드에 처음 들어오기", icon: "grass_side", by: "client" },
  { id: "plaza", title: "광장 입성", desc: "네더 포털로 메인 광장에 가기", icon: "portal", by: "client" },
  { id: "builder", title: "건축가", desc: "내 섬에 블록 놓기", icon: "oak_planks", by: "client" },
  { id: "fall", title: "앗, 발밑 조심", desc: "하늘에서 떨어져 보기", icon: "cobble", by: "client" },
  { id: "parkour", title: "하늘 정복", desc: "하늘섬 파쿠르 완주하기", icon: "gold_block", by: "server" },
  { id: "miner", title: "다이아몬드!", desc: "출석 광산에서 다이아 캐기", icon: "diamond_ore", by: "client" },
  { id: "streak7", title: "개근상", desc: "7일 연속 출석하기", icon: "amethyst", by: "client" },
  { id: "mission", title: "성실한 모험가", desc: "일일 미션 보상 받기", icon: "lectern_top", by: "server" },
  { id: "craft", title: "장인", desc: "제작대에서 상품 교환하기", icon: "crafting_front", by: "server" },
  { id: "end", title: "끝을 넘어서", desc: "엔드 포털에 뛰어들기", icon: "end_frame_top", by: "client" },
  { id: "maze", title: "미로 탈출", desc: "오늘의 미로 빠져나가기", icon: "hedge", by: "server" },
  { id: "maze_fast", title: "질주 본능", desc: "미로를 60초 안에 탈출하기", icon: "wool_lime", by: "server" },
  { id: "treasure_1", title: "보물 냄새", desc: "보물 상자 하나 찾기", icon: "chest_front", by: "server" },
  { id: "treasure_all", title: "보물 사냥꾼", desc: "하루에 보물 상자 5개 모두 찾기", icon: "beacon_core", by: "server" },
  { id: "pvp", title: "첫 승부", desc: "광장 PvP에서 상대 쓰러뜨리기", icon: "target_side", by: "client" },
  { id: "duel", title: "결투의 승자", desc: "1:1 결투에서 이기기", icon: "wool_red", by: "client" },
  { id: "duel3", title: "투기장의 전설", desc: "1:1 결투 3연승 하기", icon: "glowstone", by: "client" },
  { id: "explorer", title: "세계 여행자", desc: "미로 · 보물섬 · 결투장 모두 가 보기", icon: "sea_lantern", by: "client" },
] as const satisfies readonly { id: string; title: string; desc: string; icon: TextureName; by: "client" | "server" }[];

export type AdvId = (typeof ADVANCEMENTS)[number]["id"];

export const ADV_BY_ID = new Map<string, (typeof ADVANCEMENTS)[number]>(ADVANCEMENTS.map((a) => [a.id, a]));

export function isClientAdv(id: string): id is AdvId {
  return ADV_BY_ID.get(id)?.by === "client";
}
