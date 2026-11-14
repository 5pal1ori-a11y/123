export type StockStatus = "in_stock" | "low_stock" | "sold_out";
export type InventoryStatus = "available" | "locked" | "sold";
export type OrderStatus =
  | "pending"
  | "locked"
  | "paid"
  | "awaiting_fulfillment"
  | "dispensed"
  | "failed"
  | "expired";

export type ProductListingKind = "vending" | "individual";
export type ProductFulfillment = "auto" | "manual";

export type SpendRoleRule = {
  minAmount: number;
  roleId: string;
};
export type PaymentMethod = "card" | "transfer" | "crypto" | "demo" | "points";
export type LicenseStatus = "pending" | "unused" | "activated";
export type ShopStatus = "active" | "suspended";
export type ShopModerationStatus = "ok" | "pending_review" | "rejected";
export type LicensePlan = "free" | "lite" | "pro" | "pro_max";
export type SubscriptionStatus = "active" | "grace" | "expired";
export type ThemeMode = "light" | "dark" | "system";
export type ChargeStatus = "pending" | "completed" | "cancelled" | "failed" | "expired";
export type ChargeMethod = "bank" | "culture_gift" | "coin";

export type License = {
  id: string;
  key: string | null;
  buyerEmail: string;
  plan: LicensePlan;
  amount: number;
  status: LicenseStatus;
  shopId: string | null;
  depositorName: string | null;
  createdAt: string;
  activatedAt: string | null;
  paidAt: string | null;
};

export type Shop = {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string;
  adminUsername: string;
  adminPassword: string;
  adminPasswordHash: string | null;
  /** 환경변수 관리자 비밀번호가 지금 해시와 같은지 기억하는 HMAC 표식 — 매번 scrypt 검증을 피한다 */
  adminPasswordEnvTag?: string;
  licenseId: string;
  plan: LicensePlan;
  expiresAt: string;
  graceUntil: string;
  status: ShopStatus;
  tagline: string;
  logoUrl: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  androidDeviceKey: string | null;
  createdAt: string;
  /** 콘텐츠 검열 상태 — pending_review면 status는 suspended */
  moderationStatus: ShopModerationStatus;
  moderationReason: string | null;
  moderationFlaggedAt: string | null;
};

export type ShopSettings = {
  shopId: string;
  backgroundMusicUrl: string | null;
  backgroundMusicEnabled: boolean;
  welcomeMessage: string;
  discordInviteUrl: string | null;
  maintenanceMode: boolean;
  /** 점검 배너에 표시할 메시지 */
  maintenanceMessage: string;
  minChargeAmount: number;
  chargePresets: number[];
  autoChargeEnabled: boolean;
  autoChargeCultureGift: boolean;
  autoChargeCoin: boolean;
  /**
   * AOS 자동충전: Pushbullet Access Token
   */
  pushbulletAccessToken: string | null;
  pushbulletEnabled: boolean;
  /** @deprecated iOS 자충 제거됨 — 구 데이터 호환용 */
  iosGenToken: string | null;
  cryptoWalletAddress: string | null;
  cryptoWalletLabel: string | null;
  /** 문화상품권 API (컬쳐랜드) */
  cultureGiftEnabled: boolean;
  culturelandId: string | null;
  culturelandPassword: string | null;
  /** 코인 결제 API (NOWPayments) */
  nowpaymentsEnabled: boolean;
  nowpaymentsApiKey: string | null;
  nowpaymentsIpnSecret: string | null;
  nowpaymentsPayCurrency: string | null;
  depositSuffixPhrase: string;
  /** 관리자 로그인 허용 IP (비어 있으면 전체 허용, * 와일드카드 지원) */
  adminIpWhitelist: string[];
  /** 재고 부족 알림 임계값 */
  lowStockThreshold: number;
  lowStockAlertsEnabled: boolean;
  /** 일 매출 목표 (null이면 자동 산출) */
  salesGoalDaily: number | null;
  /** Discord 봇 연동 */
  discordBotEnabled: boolean;
  discordGuildId: string | null;
  /** 상점 등록 시 OAuth로 연동한 주인 Discord 계정 */
  discordOwnerId: string | null;
  discordOwnerUsername: string | null;
  discordOwnerAvatar: string | null;
  discordPurchaseLogChannelId: string | null;
  discordChargeLogChannelId: string | null;
  discordAdminLogChannelId: string | null;
  discordReviewLogChannelId: string | null;
  discordRestockLogChannelId: string | null;
  /** 입고 알림에 함께 멘션할 역할 */
  discordRestockRoleId: string | null;
  discordRandomBoxLogChannelId: string | null;
  discordStockChannelId: string | null;
  discordStockMessageId: string | null;
  /** /계정등록 — 채널을 만들 카테고리와 기본 접두사 */
  accountCategoryId?: string | null;
  accountPrefix?: string | null;
  /** /서버상황 — 온라인 여부를 지켜볼 디스코드 사용자 ID, 올라가 있는 패널들, 마지막 상태 */
  serverStatusUserId?: string | null;
  serverStatusPanels?: { channelId: string; messageId: string }[];
  serverStatusLast?: { status: "online" | "idle" | "dnd" | "offline"; since: string } | null;
  /** 실시간 구매 랭킹(집계판) 채널 · 고쳐 쓰는 메시지 */
  discordLeaderboardChannelId?: string | null;
  discordLeaderboardMessageId?: string | null;
  spendRoles: SpendRoleRule[];
  discordAdminRoleId: string | null;
  /** 상점 전용 Discord Application (Pro+) */
  discordBotToken: string | null;
  discordApplicationId: string | null;
  discordPublicKey: string | null;
  discordEmbedTitle: string;
  discordEmbedDescription: string;
  discordEmbedColor: number;
  discordShowNotices: boolean;
  discordShowProducts: boolean;
  discordShowBuy: boolean;
  discordShowCharge: boolean;
  discordShowInfo: boolean;
  /** Discord 메뉴 버튼 스타일 (1 Primary · 2 Secondary · 3 Success · 4 Danger) */
  discordBtnStyleNotices: number;
  discordBtnStyleProducts: number;
  discordBtnStyleBuy: number;
  discordBtnStyleCharge: number;
  discordBtnStyleInfo: number;
  discordBtnLabelNotices: string;
  discordBtnLabelProducts: string;
  discordBtnLabelBuy: string;
  discordBtnLabelCharge: string;
  discordBtnLabelInfo: string;
  /** 구매/후기 로그 커스텀 */
  discordPurchaseLogTitle: string;
  discordPurchaseLogTemplate: string;
  discordReviewLogTitle: string;
  discordReviewLogTemplate: string;
  /** 마이페이지 상단 배너 광고 */
  bannerAdsEnabled: boolean;
  bannerWeeklyPrice: number;
  bannerMonthlyPrice: number;
  /** 한국 IP만 상점 이용 허용 */
  koreaOnlyAccess: boolean;
  /** VPN·프록시·Tor 차단 */
  blockVpnProxy: boolean;
  /** 관리자 화면/로그에서 이메일·IP 마스킹 */
  maskPiiInAdmin: boolean;
  /** 로그인 화면에 보일 소셜 로그인 (예전 데이터엔 없다 → 켜짐) */
  loginMicrosoftEnabled?: boolean;
  loginDiscordEnabled?: boolean;
  /** 이용약관 / 개인정보 버전 */
  termsVersion: string;
  termsBody: string;
  privacyVersion: string;
  privacyBody: string;
  /** 자동화: 재입고 관심 알림 */
  restockNotifyEnabled: boolean;
  /** 자동화: 대기 충전 자동 만료 */
  autoExpireChargesEnabled: boolean;
  chargeExpireMinutes: number;
  /** 자동화: 일일 매출 요약 (관리자 알림) */
  dailySalesDigestEnabled: boolean;
  dailyDigestHourKst: number;
  lastDailyDigestAt: string | null;
  /** 자동화: 배너 신청 즉시 승인 */
  bannerAutoApprove: boolean;
  /** 자동화: 등급 승급 알림 */
  tierUpgradeNotifyEnabled: boolean;
  /** 자동화: 가입 환영 포인트 */
  welcomeBonusEnabled: boolean;
  welcomeBonusPoints: number;
  /** MFA MARKET 연동 (구매 시 16자리 계정 코드 자동 발급) */
  mfaApiUrl?: string | null;
  mfaApiKey?: string | null;
  /** 후기내역 탭에 불러올 Discord 후기 채널 (비우면 이름에 '후기'가 들어간 채널을 찾음) */
  reviewFeedChannelId?: string | null;
  /** 떠돌이 상인 오늘의 Deal */
  traderDeal?: TraderDeal | null;
  /** /main 마크 월드 (파쿠르 쿠폰 · 일일 미션 · 제작대 · 엔드포탈 계정) */
  world?: WorldSettings | null;
};

export type WorldMissionType = "attend" | "parkour" | "build" | "review" | "purchase" | "end_visit";

export type WorldRecipe = {
  id: string;
  productId: string;
  tokens: number;
};

export type WorldAccount = {
  id: string;
  /** 마인크래프트 닉네임 (등록 시점) */
  ign: string;
  uuid: string | null;
  /** 연결된 판매 상품 */
  productId: string | null;
  note: string;
  createdAt: string;
};

export type WorldSettings = {
  parkourCoupon: { enabled: boolean; amount: number; minutes: number };
  missions: Record<WorldMissionType, { enabled: boolean; tokens: number }>;
  recipes: WorldRecipe[];
  accounts: WorldAccount[];
};

export type TraderDeal = {
  id: string;
  productId: string;
  /** 취소선으로 보여줄 원래 가격 */
  originalPrice: number;
  dealPrice: number;
  quantity: number;
  sold: number;
  /** 1인 1회 구매 */
  buyers: string[];
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

export type BannerAdPeriod = "week" | "month";
export type BannerAdStatus = "pending" | "approved" | "rejected" | "active" | "expired";

export type ShopBannerAd = {
  id: string;
  shopId: string;
  userId: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  period: BannerAdPeriod;
  amount: number;
  status: BannerAdStatus;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
};

export type DiscordLinkCode = {
  code: string;
  shopId: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

/** 일일 랜덤박스 (KST 기준 1회, 0~3000원, 1200+ 잭팟) */
export type RandomBoxClaim = {
  id: string;
  shopId: string;
  userId: string;
  dayKey: string;
  amount: number;
  jackpot: boolean;
  createdAt: string;
};

export type ShopCategory = {
  id: string;
  shopId: string;
  name: string;
  createdAt: string;
};

export type ShopTier = {
  id: string;
  shopId: string;
  name: string;
  minTotalCharged: number;
  discountPercent: number;
  color: string;
  /** 누적 충전액이 기준에 닿으면 자동으로 주는 Discord 역할 ID */
  discordRoleId?: string | null;
  createdAt: string;
};

export type ShopCoupon = {
  id: string;
  shopId: string;
  code: string;
  discountPercent: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
};

export type ShopReview = {
  id: string;
  shopId: string;
  userId: string;
  productId: string | null;
  rating: number;
  body: string;
  approved: boolean;
  createdAt: string;
};

export type BugReport = {
  id: string;
  shopId: string;
  userId: string | null;
  email: string;
  subject: string;
  body: string;
  status: "open" | "resolved";
  createdAt: string;
};

export type InquiryActor = "user" | "ai" | "admin";

export type ShopInquiryMessage = {
  id: string;
  from: InquiryActor;
  body: string;
  createdAt: string;
};

export type ShopInquiry = {
  id: string;
  shopId: string;
  userId: string;
  subject: string;
  body: string;
  status: "open" | "answered";
  reply: string | null;
  repliedAt: string | null;
  /** Discord 티켓 채널 동기화 */
  discordChannelId: string | null;
  discordMessageId: string | null;
  createdAt: string;
  messages: ShopInquiryMessage[];
  /** 관리자가 들어오면 false — AI 자동응답 중지 */
  aiEnabled: boolean;
  adminJoinedAt: string | null;
};

/** Shop owner → DOES platform support (Channel Talk style) */
export type PlatformSupportMessage = {
  id: string;
  shopId: string;
  shopSlug: string;
  shopName: string;
  senderEmail: string;
  body: string;
  status: "open" | "answered";
  reply: string | null;
  /** 1차 AI 자동 답변 */
  aiReply: string | null;
  aiRepliedAt: string | null;
  createdAt: string;
  repliedAt: string | null;
};

export type StaffPermission =
  | "billing"
  | "products"
  | "orders"
  | "users"
  | "inquiries"
  | "settings"
  | "bot"
  | "logs";

export const ALL_STAFF_PERMISSIONS: StaffPermission[] = [
  "billing",
  "products",
  "orders",
  "users",
  "inquiries",
  "settings",
  "bot",
  "logs",
];

export type ShopUser = {
  id: string;
  shopId: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  /** Microsoft 계정 고유 ID (id_token sub) — 예전 데이터엔 없다 */
  microsoftId?: string | null;
  /** Microsoft 로그인 때 확인한 마인크래프트 정품 프로필 (게임을 안 가졌으면 null) */
  minecraftUuid?: string | null;
  minecraftName?: string | null;
  /** true 면 Microsoft 확인 없이 본인이 직접 입력한 자바 닉네임 (스킨 표시용) */
  minecraftManual?: boolean;
  /** 가입한 IP — 한 아이피당 한 계정 제한에 쓴다 (예전 데이터엔 없다) */
  signupIp?: string | null;
  name: string;
  /**
   * 계좌 충전 입금자명 — 최초 1회 설정 후 고정.
   * null이면 충전 시 본인이 설정해야 함.
   */
  bankDepositorName: string | null;
  avatar: string | null;
  points: number;
  totalCharged: number;
  discordId: string | null;
  discordUsername: string | null;
  theme: ThemeMode;
  tierId: string | null;
  isSubAdmin: boolean;
  /** 스태프 권한 (isSubAdmin일 때). 비어 있으면 전체 허용(레거시) */
  staffPermissions: StaffPermission[];
  /** 제재 */
  banned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  /** 동의한 약관/개인정보 버전 */
  acceptedTermsVersion: string | null;
  acceptedPrivacyVersion: string | null;
  /** 내 추천인 코드 (처음 조회할 때 만든다) */
  referralCode?: string | null;
  /** 나를 추천한 사람의 user id — 한 번 정하면 못 바꾼다 */
  referredBy?: string | null;
  /** 추천 보상으로 받은 포인트 합계 */
  referralEarned?: number;
  createdAt: string;
};

export type Notice = {
  id: string;
  shopId: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
};

export type PlatformNotice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
};

export type ShopEvent = {
  id: string;
  shopId: string;
  title: string;
  description: string;
  productId: string | null;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

export type PointCharge = {
  id: string;
  shopId: string;
  userId: string;
  amount: number;
  method: ChargeMethod;
  reference: string;
  depositorName: string | null;
  status: ChargeStatus;
  createdAt: string;
  /** 대기 충전 만료 시각 (기본 생성 후 10분) */
  expiresAt: string | null;
  completedAt: string | null;
  failReason: string | null;
  nowpaymentsId: string | null;
  payAddress: string | null;
  payAmount: number | null;
  payCurrency: string | null;
  /** 충전 로그 채널에 올린 승인/거절 메시지 — 자동충전 시 완료로 수정 */
  discordLogChannelId: string | null;
  discordLogMessageId: string | null;
  /** 유저가 받은 충전 안내 응답 — 자동충전 시 완료로 수정 (15분 유효) */
  discordApplicationId: string | null;
  discordInteractionToken: string | null;
};

/** 상품 종류: 기타상품 / 마인크래프트 계정 */
export type ProductKind = "general" | "mc_account" | "mc_cape";

export type Product = {
  id: string;
  shopId: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  category: string;
  thumbnail: string | null;
  active: boolean;
  /** 1인 구매 한도 (null/0 = 무제한) */
  purchaseLimitPerUser: number | null;
  /** 버전·시즌 태그 (예: v2, 시즌1) */
  tags: string[];
  /** 구매 시 지급할 Discord 역할 ID */
  discordRoleId: string | null;
  /** 재고현황: 자판기상품 / 개별상품 */
  listingKind?: ProductListingKind;
  /** 자동지급(코드) 또는 관리자 수동지급 */
  fulfillment?: ProductFulfillment;
  /** 수동지급 구매 직후 구매자에게 보여줄 안내 */
  manualNotice?: string | null;
  /** 재고현황 채널에서 숨김 */
  stockBoardHidden?: boolean;
  /** MFA MARKET 상품 종류 (예: Normal MFA). 설정되면 재고 대신 MFA MARKET에서 코드를 발급받는다 */
  mfaProduct?: string | null;
  /** true면 MFA 카탈로그 동기화가 끈 상품, false면 관리자가 직접 켜고 끈 상품 (동기화가 다시 켜지 않음) */
  mfaAutoInactive?: boolean;
  /** MFA MARKET 재고 캐시 */
  mfaStock?: number | null;
  mfaStockAt?: string | null;
  /** 상품 자체 할인율 % (0~90, 없으면 0) — 목록에 원가 취소선 + 할인가로 표시 */
  discountPercent?: number | null;
  /** 상품 종류 (기본: 기타상품) */
  productKind?: ProductKind;
  /** 마크계정상품: 계정 닉네임 (관리자 전용 — 공개 목록에서는 제거됨) */
  /** 망토상품: 망토 종류 (예: aurora) */
  capeType?: string | null;
  mcNickname?: string | null;
  /** 마크계정상품: 공개용 마스킹 닉네임 (예: BO*******5) */
  mcMaskedName?: string | null;
  /** 마크계정상품: 닉네임이 바뀌면 달라지는 짧은 값 — 스킨·망토 이미지 캐시를 새로 받게 한다 */
  mcVersion?: string | null;
  createdAt: string;
};

/** 외부(MFA MARKET)에서 발급받은 코드로 주문을 채울 때 사용 */
export type ExternalDelivery = {
  /** 주문별로 저장될 지급 내용 (수량만큼) */
  codes: string[];
  stockLeft: number;
  /** DM에 붙일 링크 버튼 */
  links?: { label: string; url: string }[];
  /** 구매 로그에 표시할 가려진 코드 */
  logHints?: string[];
};

export type ProductWithStock = Product & {
  availableCount: number;
  stockStatus: StockStatus;
};

export type InventoryItem = {
  id: string;
  shopId: string;
  productId: string;
  codeValue: string;
  status: InventoryStatus;
  orderId: string | null;
  lockedUntil: string | null;
  createdAt: string;
};

export type Order = {
  id: string;
  shopId: string;
  orderUuid: string;
  productId: string;
  buyerEmail: string;
  userId: string | null;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  amount: number;
  quantity: number;
  dispensedCode: string | null;
  depositorName: string | null;
  accessToken: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type SystemLog = {
  id: string;
  shopId: string | null;
  actor: string;
  action: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

export function resolveStockStatus(count: number): StockStatus {
  if (count <= 0) return "sold_out";
  if (count <= 5) return "low_stock";
  return "in_stock";
}

export type PublicUser = Pick<
  ShopUser,
  | "id"
  | "email"
  | "name"
  | "bankDepositorName"
  | "avatar"
  | "points"
  | "totalCharged"
  | "discordId"
  | "discordUsername"
  | "theme"
  | "tierId"
  | "isSubAdmin"
  | "staffPermissions"
  | "banned"
  | "banReason"
  | "acceptedTermsVersion"
  | "acceptedPrivacyVersion"
  | "minecraftUuid"
  | "minecraftName"
  | "minecraftManual"
>;

export type WishlistItem = {
  id: string;
  shopId: string;
  userId: string;
  productId: string;
  createdAt: string;
  /** 재입고 알림 구독 */
  notifyRestock: boolean;
  lastRestockNotifiedAt: string | null;
};

export type UserNotification = {
  id: string;
  shopId: string;
  userId: string;
  type: "restock" | "tier_upgrade" | "welcome";
  title: string;
  body: string;
  productId: string | null;
  read: boolean;
  createdAt: string;
};

export type LoginHistoryEntry = {
  id: string;
  shopId: string;
  subjectId: string;
  role: "user" | "admin";
  ip: string;
  userAgent: string;
  deviceLabel: string;
  createdAt: string;
};

export type AuthSession = {
  id: string;
  shopId: string;
  subjectId: string;
  role: "user" | "admin";
  ip: string;
  userAgent: string;
  deviceLabel: string;
  createdAt: string;
  lastActiveAt: string;
  /** 로그아웃 · 강제 종료된 세션. 쿠키가 남아 있어도 다시 살아나지 않게 지우지 않고 표시만 한다 */
  revokedAt?: string;
};

export type AdminNotification = {
  id: string;
  shopId: string;
  type: "low_stock" | "license_expiry" | "sales_digest";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type MonthlyReportRow = {
  month: string;
  chargeTotal: number;
  chargeCount: number;
  purchaseTotal: number;
  purchaseCount: number;
};
