export const DOES_COMMUNITY_COMMANDS = [
  {
    "options": [
      {
        "type": 1,
        "name": "post",
        "description": "역할 토글 버튼 패널 게시",
        "options": [
          {
            "channel_types": [
              0
            ],
            "name": "채널",
            "description": "게시할 채널",
            "required": false,
            "type": 7
          }
        ]
      }
    ],
    "name": "roles",
    "description": "역할 선택 패널 (관리자 전용)",
    "type": 1
  },
  {
    "options": [
      {
        "type": 3,
        "name": "내용",
        "description": "보낼 메시지 (비우면 모달 입력)",
        "required": false
      },
      {
        "channel_types": [
          0
        ],
        "name": "채널",
        "description": "보낼 채널",
        "required": false,
        "type": 7
      },
      {
        "name": "파일",
        "description": "첨부 파일",
        "required": false,
        "type": 11
      },
      {
        "name": "임베드",
        "description": "컨테이너 형식으로 보내기",
        "required": false,
        "type": 5
      }
    ],
    "name": "say",
    "description": "봇이 메시지를 보냅니다 (관리자 전용)",
    "type": 1
  },
  {
    "options": [
      {
        "type": 1,
        "name": "add",
        "description": "유저 거래 금액 추가",
        "options": [
          {
            "name": "유저",
            "description": "대상 유저",
            "required": true,
            "type": 6
          },
          {
            "min_value": 0.01,
            "type": 10,
            "name": "금액",
            "description": "금액 ($)",
            "required": true
          }
        ]
      },
      {
        "type": 1,
        "name": "cancel",
        "description": "거래 취소 (유저 기준)",
        "options": [
          {
            "name": "유저",
            "description": "취소할 거래의 유저",
            "required": true,
            "type": 6
          },
          {
            "min_value": 0.01,
            "type": 10,
            "name": "금액",
            "description": "취소할 금액 (비우면 해당 유저 최근 거래)",
            "required": false
          }
        ]
      },
      {
        "type": 1,
        "name": "hidden",
        "description": "리더보드에서 이름 숨기기/표시",
        "options": [
          {
            "name": "유저",
            "description": "대상 유저",
            "required": true,
            "type": 6
          }
        ]
      },
      {
        "type": 1,
        "name": "setup",
        "description": "리더보드 채널 설정 (관리자)",
        "options": [
          {
            "channel_types": [
              0
            ],
            "name": "채널",
            "description": "리더보드 채널",
            "required": true,
            "type": 7
          }
        ]
      }
    ],
    "name": "deal",
    "description": "거래 기록 및 리더보드 관리",
    "type": 1
  },
  {
    "options": [
      {
        "type": 1,
        "name": "create",
        "description": "새 리스팅 생성 폼 열기",
        "options": []
      },
      {
        "type": 1,
        "name": "mine",
        "description": "내 OWNER-STOCK 확인",
        "options": []
      },
      {
        "type": 1,
        "name": "stats",
        "description": "Hypixel 스탯 조회 (Mojang UUID → Hypixel API)",
        "options": [
          {
            "type": 3,
            "name": "닉네임",
            "description": "마인크래프트 닉네임",
            "required": true
          }
        ]
      },
      {
        "type": 1,
        "name": "refresh",
        "description": "재고 임베드 새로고침 (관리자)",
        "options": []
      }
    ],
    "name": "list",
    "description": "계정 리스팅 관리",
    "type": 1
  },
  {
    "options": [
      {
        "type": 1,
        "name": "add",
        "description": "C/O 오퍼 추가",
        "options": [
          {
            "min_value": 0.01,
            "type": 10,
            "name": "amount",
            "description": "오퍼 금액 ($)",
            "required": true
          },
          {
            "name": "offerer",
            "description": "오퍼한 사람",
            "required": false,
            "type": 6
          },
          {
            "channel_types": [
              0
            ],
            "name": "listing",
            "description": "리스팅 채널",
            "required": false,
            "type": 7
          }
        ]
      }
    ],
    "name": "offer",
    "description": "리스팅 오퍼 관리",
    "type": 1
  },
  {
    "options": [
      {
        "type": 1,
        "name": "set",
        "description": "Buy It Now 가격 설정",
        "options": [
          {
            "min_value": 0,
            "type": 10,
            "name": "amount",
            "description": "BIN 가격 ($)",
            "required": true
          },
          {
            "channel_types": [
              0
            ],
            "name": "listing",
            "description": "리스팅 채널",
            "required": false,
            "type": 7
          }
        ]
      }
    ],
    "name": "bin",
    "description": "BIN 가격 설정",
    "type": 1
  },
  {
    "options": [
      {
        "type": 1,
        "name": "info",
        "description": "Info 수정",
        "options": [
          {
            "type": 3,
            "name": "text",
            "description": "새 Info",
            "required": true
          },
          {
            "channel_types": [
              0
            ],
            "name": "listing",
            "description": "리스팅 채널",
            "required": false,
            "type": 7
          }
        ]
      },
      {
        "type": 1,
        "name": "username",
        "description": "마인크래프트 닉네임 수정 (Mojang 검증)",
        "options": [
          {
            "type": 3,
            "name": "name",
            "description": "마인크래프트 닉네임",
            "required": true
          },
          {
            "channel_types": [
              0
            ],
            "name": "listing",
            "description": "리스팅 채널",
            "required": false,
            "type": 7
          }
        ]
      },
      {
        "type": 1,
        "name": "hidden",
        "description": "리스팅/오너 이름 숨기기",
        "options": [
          {
            "name": "hide",
            "description": "숨김 여부",
            "required": true,
            "type": 5
          },
          {
            "channel_types": [
              0
            ],
            "name": "listing",
            "description": "리스팅 채널",
            "required": false,
            "type": 7
          }
        ]
      },
      {
        "type": 1,
        "name": "proxy",
        "description": "프록시 채널 설정",
        "options": [
          {
            "channel_types": [
              0
            ],
            "name": "channel",
            "description": "프록시 채널",
            "required": false,
            "type": 7
          },
          {
            "channel_types": [
              0
            ],
            "name": "listing",
            "description": "리스팅 채널",
            "required": false,
            "type": 7
          }
        ]
      }
    ],
    "name": "edit",
    "description": "리스팅 정보 수정",
    "type": 1
  },
  {
    "options": [
      {
        "name": "유저",
        "description": "확인할 유저",
        "required": false,
        "type": 6
      }
    ],
    "name": "바우처",
    "description": "후기(바우처) 개수 확인",
    "type": 1
  },
  {
    "options": [
      {
        "type": 3,
        "name": "내용",
        "description": "봇이 보낼 메시지",
        "required": true
      },
      {
        "channel_types": [
          0
        ],
        "name": "채널",
        "description": "보낼 채널 (비우면 현재 채널)",
        "required": false,
        "type": 7
      },
      {
        "name": "임베드",
        "description": "고급 컨테이너 형식으로 보낼지 여부",
        "required": false,
        "type": 5
      }
    ],
    "name": "말하기",
    "description": "봇이 대신 메시지를 보냅니다 (관리자 전용)",
    "type": 1
  },
  {
    "options": [],
    "name": "출석",
    "description": "출석체크하고 1~100원 랜덤 보상을 받습니다 (하루 1회)",
    "type": 1
  },
  {
    "options": [],
    "name": "출석상점",
    "description": "출석 포인트로 뽑기권을 구매할 수 있는 상점을 엽니다",
    "type": 1
  },
  {
    "options": [
      {
        "min_value": 1,
        "type": 4,
        "name": "걸포인트",
        "description": "베팅할 포인트",
        "required": true
      },
      {
        "type": 4,
        "choices": [
          {
            "name": "2배 (50%)",
            "value": 2
          },
          {
            "name": "3배 (33%)",
            "value": 3
          },
          {
            "name": "4배 (25%)",
            "value": 4
          }
        ],
        "name": "배당",
        "description": "배당 배수",
        "required": true
      }
    ],
    "name": "도박",
    "description": "포인트를 걸고 배당을 노립니다",
    "type": 1
  },
  {
    "options": [
      {
        "type": 4,
        "name": "숫자",
        "description": "맞출 숫자",
        "required": true
      },
      {
        "channel_types": [
          0
        ],
        "name": "채널",
        "description": "게임 채널",
        "required": true,
        "type": 7
      }
    ],
    "name": "숫자",
    "description": "채널에서 숫자 맞추기 게임을 시작합니다",
    "type": 1
  },
  {
    "options": [
      {
        "type": 4,
        "name": "숫자",
        "description": "입력할 숫자",
        "required": true
      }
    ],
    "name": "맞추기",
    "description": "숫자 맞추기 게임에 숫자를 입력합니다",
    "type": 1
  },
  {
    "options": [
      {
        "type": 3,
        "name": "상품",
        "description": "이벤트 상품",
        "required": true
      },
      {
        "min_value": 1,
        "type": 4,
        "name": "시간",
        "description": "이벤트 시간 (분)",
        "required": true
      },
      {
        "type": 3,
        "name": "내용",
        "description": "이벤트 설명 (선택)",
        "required": false
      }
    ],
    "name": "이벤트",
    "description": "이벤트를 생성합니다 (관리자 전용)",
    "type": 1
  },
  {
    "options": [
      {
        "name": "유저",
        "description": "확인할 유저 (관리자 전용)",
        "required": false,
        "type": 6
      }
    ],
    "name": "잔액",
    "description": "잔액을 확인합니다",
    "type": 1
  },
  {
    "options": [
      {
        "type": 3,
        "choices": [
          {
            "name": "지급",
            "value": "add"
          },
          {
            "name": "차감",
            "value": "remove"
          }
        ],
        "name": "종류",
        "description": "지급 또는 차감",
        "required": true
      },
      {
        "name": "유저",
        "description": "대상 유저",
        "required": true,
        "type": 6
      },
      {
        "min_value": 1,
        "type": 4,
        "name": "금액",
        "description": "금액 (원)",
        "required": true
      }
    ],
    "name": "잔액관리",
    "description": "유저 잔액을 지급/차감합니다 (관리자 전용)",
    "type": 1
  },
  {
    "options": [
      {
        "name": "유저",
        "description": "구매한 유저",
        "required": true,
        "type": 6
      },
      {
        "type": 3,
        "name": "상품",
        "description": "상품명",
        "required": true
      },
      {
        "min_value": 0,
        "type": 4,
        "name": "금액",
        "description": "구매 금액 (원)",
        "required": true
      }
    ],
    "name": "구매기록",
    "description": "유저의 구매 내역을 기록합니다 (관리자 전용)",
    "type": 1
  },
  {
    "options": [
      {
        "name": "유저",
        "description": "확인할 유저 (관리자 전용)",
        "required": false,
        "type": 6
      }
    ],
    "name": "내정보",
    "description": "잔액 / 총 구매내역 / 후기 수 / 출석 정보를 확인합니다",
    "type": 1
  },
  {
    "options": [
      {
        "type": 1,
        "name": "후기채널",
        "description": "후기가 자동 저장될 채널을 지정합니다",
        "options": [
          {
            "channel_types": [
              0
            ],
            "name": "채널",
            "description": "후기 채널",
            "required": true,
            "type": 7
          }
        ]
      },
      {
        "type": 1,
        "name": "바우처채널",
        "description": "멘션 기반 바우처 카운트 채널 지정",
        "options": [
          {
            "channel_types": [
              0
            ],
            "name": "채널",
            "description": "바우처 채널",
            "required": true,
            "type": 7
          }
        ]
      },
      {
        "type": 1,
        "name": "재고채널",
        "description": "Current Stock 임베드 채널 지정",
        "options": [
          {
            "channel_types": [
              0
            ],
            "name": "채널",
            "description": "재고 채널",
            "required": true,
            "type": 7
          }
        ]
      },
      {
        "type": 1,
        "name": "오너재고채널",
        "description": "OWNER-STOCK 채널 지정",
        "options": [
          {
            "channel_types": [
              0
            ],
            "name": "채널",
            "description": "오너 재고 채널",
            "required": true,
            "type": 7
          }
        ]
      },
      {
        "type": 1,
        "name": "리스팅카테고리",
        "description": "리스팅 채널이 생성될 카테고리 지정",
        "options": [
          {
            "channel_types": [
              4
            ],
            "name": "카테고리",
            "description": "카테고리",
            "required": true,
            "type": 7
          }
        ]
      },
      {
        "type": 1,
        "name": "오너추가",
        "description": "리스팅 오너 목록에 유저 추가",
        "options": [
          {
            "name": "유저",
            "description": "오너로 추가할 유저",
            "required": true,
            "type": 6
          }
        ]
      },
      {
        "type": 1,
        "name": "오너제거",
        "description": "리스팅 오너 목록에서 유저 제거",
        "options": [
          {
            "name": "유저",
            "description": "제거할 유저",
            "required": true,
            "type": 6
          }
        ]
      }
    ],
    "name": "채널설정",
    "description": "봇 설정 (관리자 전용)",
    "type": 1
  },
  {
    "options": [],
    "name": "백업",
    "description": "데이터베이스 백업 파일을 생성하고 첨부해 줍니다 (관리자 전용)",
    "type": 1
  },
  {
    "options": [
      {
        "min_value": 1,
        "type": 4,
        "name": "개수",
        "description": "최근 몇 개만 복구할지 (비우면 전체)",
        "required": false
      }
    ],
    "name": "후기복구",
    "description": "저장된 후기를 현재 채널에 전부 다시 게시합니다 (새 서버 복구용, 관리자 전용)",
    "type": 1
  }
] as const;

export const DOES_COMMUNITY_NAMES = new Set(["roles","say","deal","list","offer","bin","edit","바우처","말하기","출석","출석상점","도박","숫자","맞추기","이벤트","잔액","잔액관리","구매기록","내정보","채널설정","백업","후기복구"]);

const RENAME_TO_DOES: Record<string, string> = { 채널설정: "설정", 후기복구: "복구" };

export function rewriteDoesCommandName(name: string) {
  return RENAME_TO_DOES[name] || name;
}
