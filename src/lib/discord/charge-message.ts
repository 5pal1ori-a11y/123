import {
  MessageFlags,
  container,
  separator,
  textDisplay,
} from "@/lib/discord/components";
import { editChannelMessage, editInteractionOriginal } from "@/lib/discord/rest";
import type { PointCharge } from "@/lib/types";

/** Update Discord charge-request / charge-guide messages after auto/manual complete */
export async function markChargeMessagesCompleted(input: {
  shopId: string;
  charge: PointCharge;
  balance: number;
  resultLabel?: string;
}) {
  const { shopId, charge, balance } = input;
  const resultLabel = input.resultLabel || "승인됨";
  const depositor = charge.depositorName || "-";
  const amountLabel = `${charge.amount.toLocaleString()}원`;
  const balanceLabel = `${balance.toLocaleString()}원`;

  const tasks: Promise<unknown>[] = [];

  if (charge.discordLogChannelId && charge.discordLogMessageId) {
    tasks.push(
      editChannelMessage(
        charge.discordLogChannelId,
        charge.discordLogMessageId,
        {
          flags: MessageFlags.IS_COMPONENTS_V2,
          components: [
            container([
              textDisplay("## 충전 완료"),
              separator(true, 1),
              textDisplay(`**입금자명**\n${depositor}`),
              textDisplay(`**충전 금액**\n${amountLabel}`),
              textDisplay(`**현재 잔액**\n${balanceLabel}`),
              separator(true, 1),
              textDisplay(`**처리 결과**\n${resultLabel}`),
            ]),
          ],
        },
        shopId,
      ),
    );
  }

  if (charge.discordApplicationId && charge.discordInteractionToken) {
    tasks.push(
      editInteractionOriginal(charge.discordApplicationId, charge.discordInteractionToken, {
        flags: MessageFlags.IS_COMPONENTS_V2,
        components: [
          container([
            textDisplay("## 충전 완료"),
            textDisplay("입금이 확인되어 잔액에 반영되었어요."),
            separator(true, 1),
            textDisplay(`**입금자명**\n${depositor}`),
            textDisplay(`**충전 금액**\n${amountLabel}`),
            textDisplay(`**현재 잔액**\n${balanceLabel}`),
            textDisplay(`**처리 결과**\n${resultLabel}`),
            separator(true, 1),
            textDisplay(`-# DOES · <t:${Math.floor(Date.now() / 1000)}:f>`),
          ]),
        ],
      }),
    );
  }

  if (tasks.length) await Promise.allSettled(tasks);
}
