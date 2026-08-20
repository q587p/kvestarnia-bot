export const REFERRAL_INVITE_SHARE_TEXT_TEMPLATES = [
  (name: string) => `«${name}» лишає тобі поклик до Квестарні. Створи пригодника — корчма вже сперечається, який кухоль вважати вітальним.`,
  (name: string) => `«${name}» кличе тебе до Квестарні. Тут пригоди короткі, проблеми балакучі, а манатки мають забагато думок.`,
  (name: string) => `Поклик від «${name}» знайшов для тебе двері до Квестарні. Заходь, поки писар не попросив форму 13-Д у трьох примірниках.`,
  (name: string) => `«${name}» передає тобі офіційно неофіційний поклик. У Квестарні саме бракує ще одного пригодника зі здоровим сумнівом.`,
  (name: string) => `«${name}» запрошує до української текстової RPG у Telegram. Корчма тепла, Низ підозрілий, вибір за тобою.`,
  (name: string) => `«${name}» залишає стежку до Квестарні. Вона веде повз корчму, дивні справи й монстрів із переконливими довідками.`,
  (name: string) => `«${name}» вважає, що тобі час стати пригодником. Квестарня нічого не гарантує, крім пригод і дуже серйозних папірців.`,
  (name: string) => `«${name}» кличе перевірити, скільки пригод уміщається в одному Telegram-чаті. Корчмар уже звільнив місце біля дошки.`,
  (name: string) => `«${name}» надсилає поклик до Квестарні. Зброю видають не завжди, зате сумнівні рішення доступні від самого порога.`,
  (name: string) => `Поклик від «${name}» відкриває для тебе шлях до Квестарні. Створи пригодника й дізнайся, чому місцевий писар так нервує через печатки.`,
  (name: string) => `«${name}» пропонує зайти до Квестарні. Тут можна рости, збирати манатки й удавати, що саме так усе й було задумано.`,
  (name: string) => `«${name}» залишає тобі місце в пригоді. Заходь до Квестарні — корчма не безрозмірна, але сюжет про це ще не знає.`,
  (name: string) => `«${name}» передає ще один цілком справжній поклик. Квестарня чекає на нового пригодника й нові клопоти.`
] as const;

export const REFERRAL_INVITE_SHARE_TEXT_COUNT = REFERRAL_INVITE_SHARE_TEXT_TEMPLATES.length;

export interface ReferralInviteShareIdentity {
  name: string;
  activeCosmeticTitle?: string | null;
  guildCrest?: string | null;
  guildName?: string | null;
}

export function referralInviteShareBody(index: number, inviterName: string): string {
  const template = REFERRAL_INVITE_SHARE_TEXT_TEMPLATES[normalizeReferralInviteShareTextIndex(index)]!;
  return template(inviterName);
}

export function referralInviteShareText(
  index: number,
  inviter: string | ReferralInviteShareIdentity
): string {
  const identity = typeof inviter === "string" ? { name: inviter } : inviter;
  return [
    "📨 Поклик до Квестарні",
    "",
    referralInviteShareBody(index, identity.name),
    ...(identity.activeCosmeticTitle ? [`Титул: «${identity.activeCosmeticTitle}»`] : []),
    ...(identity.guildName
      ? [`Ґільдія: ${identity.guildCrest ? `${identity.guildCrest} ` : ""}${identity.guildName}`]
      : [])
  ].join("\n");
}

export function normalizeReferralInviteShareTextIndex(index: number): number {
  const count = REFERRAL_INVITE_SHARE_TEXT_COUNT;
  return Number.isSafeInteger(index) ? ((index % count) + count) % count : 0;
}
