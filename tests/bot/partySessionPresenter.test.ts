import { describe, expect, it } from "vitest";
import {
  BIG_BARREL_APPROACH_TEMPLATES,
  BIG_BARREL_INVITE_TEMPLATES,
  getInitialBigBarrelApproachTemplateIndex,
  getInitialBigBarrelInviteTemplateIndex,
  getNextBigBarrelApproachTemplateIndex,
  getNextBigBarrelInviteTemplateIndex,
  presentBigBarrelApproachNotice,
  presentPartyCreate,
  presentPartyJoin,
  presentPartyInviteShare,
  presentPartySession,
  presentPartyBoss,
  presentPartyBossAction,
  presentPartyBossIntro,
  presentPartyBossJournal
} from "../../src/bot/presenters/partySessionPresenter";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import { getCombatMantokAbilityGrantsByIds } from "../../src/content";
import { createPartyBossState, resolvePartyBossRound } from "../../src/domain/partyBoss/partyBoss";

describe("party session presenter", () => {
  it("marks Big Barrel Brother focus on participant rows instead of the boss row", () => {
    const text = presentPartyBoss(makeBigBossSession());

    expect(text).toContain("🛢️ <b>Бій: 1 хід</b>");
    expect(text).toContain("👹 Старший Брат Бочки: HP 55/100");
    expect(text).toContain("▪️ Голова: HP 60/60 · мана 20/20 ← 🎯 ціль боса");
    expect(text).toContain("▪️ Шкодійка: HP 60/60 · мана 20/20");
    expect(text).not.toContain("запечатав вдягнені манатки");
    expect(text).toContain("⏳ На хід є 23 секунди.");
  });

  it("marks every living participant on the Big Barrel Brother broad-turn cadence", () => {
    const text = presentPartyBoss(makeBigBossSession({ turn: 4 }));

    expect(text).toContain("▪️ Голова: HP 60/60 · мана 20/20 ← 🎯 ціль боса");
    expect(text).toContain("▪️ Шкодійка: HP 60/60 · мана 20/20 ← 🎯 ціль боса");
  });

  it("shows the canonical remaining Lament wait on the durable raid card", () => {
    const bard = participant("bard", "Бард");
    bard.combatStats.classId = "class.bard";
    bard.bardMusicAvailableAt = "2026-07-18T11:33:00.000Z";
    const text = presentPartyBoss(makeBigBossSession({
      participants: [bard],
      bardMusic: { kind: "none" }
    }), {
      viewerCharacterId: "bard",
      now: new Date("2026-07-18T10:00:00.000Z")
    });

    expect(text).toContain("🎻 Журлива балада буде доступна через 93 хвилини.");
  });

  it("uses response grammar for active Lament and hides expired or terminal residual state", () => {
    const lament = (remainingBossResponses: number) => ({
      kind: "lament" as const,
      activationId: "lament-1",
      sourceCharacterId: "leader",
      grade: "memorable" as const,
      damageReduction: 5,
      remainingBossResponses,
      activatedTurn: 1
    });

    expect(presentPartyBoss(makeBigBossSession({ bardMusic: lament(1) }))).toContain("ще 1 відповідь");
    expect(presentPartyBoss(makeBigBossSession({ bardMusic: lament(2) }))).toContain("ще 2 відповіді");
    expect(presentPartyBoss(makeBigBossSession({ bardMusic: lament(5) }))).toContain("ще 5 відповідей");
    expect(presentPartyBoss(makeBigBossSession({ bardMusic: lament(0) }))).not.toContain("−5 шкоди");
    expect(presentPartyBoss(makeBigBossSession(
      { status: "won", bardMusic: lament(2) },
      { status: "won" }
    ))).not.toContain("Журлива балада");
  });

  it("stores and renders Lament activation, tick and expiry in raid journal pages", () => {
    const round = (
      turn: number,
      activated: boolean,
      remainingBossResponses: number,
      expired: boolean
    ): PartyBossSessionRecord["state"]["roundLog"][number] => ({
      turn,
      actions: [],
      bossDamage: 0,
      bossHpAfter: 55,
      bossRetaliations: [],
      bardMusic: {
        kind: "lament",
        activationId: "lament-journal",
        sourceCharacterId: "leader",
        damageReduction: 3,
        activated,
        remainingBossResponses,
        expired
      },
      statusAfter: "active"
    });
    const session = makeBigBossSession({
      turn: 4,
      roundLog: [round(1, true, 2, false), round(2, false, 1, false), round(3, false, 0, true)]
    });

    expect(presentPartyBossJournal(session, 0)).toContain("затягує журливу баладу");
    expect(presentPartyBossJournal(session, 0)).toContain("ще 2 відповіді");
    expect(presentPartyBossJournal(session, 1)).toContain("ще 1 відповідь");
    expect(presentPartyBossJournal(session, 2)).toContain("Остання нота стихла");
  });

  it("advertises Bard support in raid tips only while the feature state is present", () => {
    const bard = participant("leader", "Бард");
    bard.combatStats.classId = "class.bard";
    const enabled = makeBigBossSession({ participants: [bard], bardMusic: { kind: "none" } });
    enabled.participants[0]!.classId = "class.bard";
    enabled.participants[0]!.raceId = "race.no-raid-hint";
    const disabled = makeBigBossSession({ participants: [bard] });
    disabled.participants[0]!.classId = "class.bard";
    disabled.participants[0]!.raceId = "race.no-raid-hint";

    expect(presentPartyBossIntro(enabled, "leader")).toContain("надихнути товариство виступом");
    expect(presentPartyBossIntro(enabled, "leader")).toContain("журливою баладою");
    expect(presentPartyBossIntro(disabled, "leader")).not.toContain("надихнути товариство");
    expect(presentPartyBossIntro(disabled, "leader")).not.toContain("журливою баладою");
    expect(presentPartyBossIntro(disabled, "leader")).toContain("Порада дня:");
  });

  it("shows carried Kharakternyk ward signs without a zero-support counter", () => {
    const text = presentPartyBoss(makeBigBossSession({
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "leader",
        supportCount: 0,
        supportCap: 7,
        mitigationPercent: 25,
        status: "carried",
        usesRemaining: 1,
        usesMax: 1
      }
    }));

    expect(text).toContain("🧿 Знак характерника тримається.");
    expect(text).not.toContain("Підпор: 0/7");
  });

  it("shows partially cracked Kharakternyk ward support charges on active cards", () => {
    const text = presentPartyBoss(makeBigBossSession({
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "leader",
        supportCount: 2,
        supportCap: 7,
        mitigationPercent: 45,
        status: "carried",
        usesRemaining: 1,
        usesMax: 2,
        triggeredTurn: 4,
        preventedDamage: 12,
        affectedCharacterIds: ["leader", "striker"]
      }
    }));

    expect(text).toContain("🧿 Знак характерника частково тріснув і всього забрав на себе 12 шкоди. Підпор: 1/7.");
  });

  it("shows cumulative Kharakternyk ward damage after final breakage on active cards", () => {
    const text = presentPartyBoss(makeBigBossSession({
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "leader",
        supportCount: 2,
        supportCap: 7,
        mitigationPercent: 45,
        status: "broken",
        usesRemaining: 0,
        usesMax: 2,
        triggeredTurn: 8,
        preventedDamage: 23,
        affectedCharacterIds: ["leader", "striker"]
      }
    }));

    expect(text).toContain("🧿 Знак характерника вже зовсім тріснув і всього забрав на себе 23 шкоди.");
  });

  it("avoids zero-damage Kharakternyk ward totals on active cards", () => {
    const text = presentPartyBoss(makeBigBossSession({
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "leader",
        supportCount: 0,
        supportCap: 7,
        mitigationPercent: 25,
        status: "broken",
        usesRemaining: 0,
        usesMax: 1,
        triggeredTurn: 4,
        preventedDamage: 0,
        affectedCharacterIds: ["leader"]
      }
    }));

    expect(text).toContain("🧿 Знак характерника вже зовсім тріснув, але шкода так і прослизнула повз нього.");
    expect(text).not.toContain("0 шкоди");
  });

  it("shows final Kharakternyk ward breakage in recent actions", () => {
    const text = presentPartyBoss(makeBigBossSession({
      roundLog: [{
        turn: 4,
        actions: [],
        bossDamage: 0,
        bossHpAfter: 55,
        bossRetaliations: [],
        wardSign: {
          kind: "kharakternyk",
          status: "triggered",
          supportCount: 2,
          supportCap: 7,
          usesRemaining: 0,
          usesMax: 2,
          mitigationPercent: 45,
          preventedDamage: 11,
          affectedCharacterIds: ["leader", "striker"]
        },
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("🧿 Знак характерника луснув зовсім і цього разу забрав на себе 11 шкоди. Підпор не лишилося.");
  });

  it("avoids zero-damage Kharakternyk ward recent-action lines", () => {
    const text = presentPartyBoss(makeBigBossSession({
      roundLog: [{
        turn: 4,
        actions: [],
        bossDamage: 0,
        bossHpAfter: 55,
        bossRetaliations: [],
        wardSign: {
          kind: "kharakternyk",
          status: "triggered",
          supportCount: 0,
          supportCap: 7,
          usesRemaining: 0,
          usesMax: 1,
          mitigationPercent: 25,
          preventedDamage: 0,
          affectedCharacterIds: ["leader"]
        },
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("🧿 Знак характерника луснув зовсім, але цього разу шкода прослизнула повз нього.");
    expect(text).not.toContain("0 шкоди");
  });

  it("replays stored Bureaucramancer protocol trigger lines on Big Barrel Brother cards", () => {
    const text = presentPartyBoss(makeBigBossSession({
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-party-big",
        filerCharacterId: "leader",
        signatures: [{
          characterId: "leader",
          status: "spent",
          triggeredTurn: 1,
          bossActionId: "big-barrel:1:personal:leader",
          preventedDamage: 17
        }, {
          characterId: "striker",
          status: "unspent"
        }]
      },
      roundLog: [{
        turn: 1,
        actions: [],
        bossDamage: 0,
        bossHpAfter: 55,
        bossRetaliations: [{
          characterId: "leader",
          damage: 0,
          hpAfter: 60,
          damageBeforeProtocol: 17,
          protocolPreventedDamage: 17
        }],
        personalProtocol: {
          kind: "bureaucramancer-personal-protocol-13b",
          status: "triggered",
          characterId: "leader",
          preventedDamage: 17,
          triggeredTurn: 1,
          bossActionId: "big-barrel:1:personal:leader",
          spentCount: 1,
          signatureCount: 2
        },
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("📄 Протокол 13-З у бою. Невитрачених підписів: 1/2. Уже запобігло: 17 шкоди.");
    expect(text).toContain("удар застряг у паперах і завдає 0 шкоди");
    expect(text).toContain("📄 Протокол 13-З спрацьовує");
    expect(text).toContain("Запобігло 17 шкоди.");
    expect(text).toContain("Підпис витрачено: 1/2.");
  });

  it("shows active Warrior Taunt, redirected broad attacks, expiry, and durable cooldown text", () => {
    const activeSession = makeBigBossSession({
      turn: 4,
      warriorTaunt: {
        active: { characterId: "leader", activatedTurn: 4, bossAttacksRemaining: 2 },
        cooldowns: { leader: { availableTurn: 9 } }
      },
      roundLog: [{
        turn: 4,
        actions: [{
          characterId: "leader",
          action: "taunt",
          origin: "manual",
          outcome: "taunt-activated",
          damage: 0,
          manaSpent: 0
        }],
        bossDamage: 0,
        bossHpAfter: 55,
        bossRetaliations: [{
          characterId: "leader",
          damage: 7,
          hpAfter: 53,
          tauntRedirected: true,
          tauntOriginalKind: "broad"
        }],
        warriorTaunt: {
          activatedCharacterId: "leader",
          redirectedCharacterId: "leader",
          redirectedAttackKind: "broad",
          bossAttacksRemaining: 2
        },
        statusAfter: "active"
      }]
    });

    const active = presentPartyBoss(activeSession, { viewerCharacterId: "leader" });
    const journal = presentPartyBossJournal(activeSession, 0);
    expect(active).toContain("🛡️ Увага Бочки: Голова, ще 2 ходи.");
    expect(active.match(/🛡️ Увага Бочки: Голова, ще 2 ходи\./gu)).toHaveLength(1);
    expect(active).toContain("🫁 🛡️ «На мене!» відсапується: ще 5 ходів.");
    expect(active).toContain("🛢️ <i>Бочковий гуркіт</i> згортається в один удар. Ціль: Голова. Завдано 7 шкоди.");
    expect(journal).not.toContain("Виклик запізнився");
    expect(journal).toContain("увага Бочки переходить туди");
    expect(journal).toContain("🎯 На наступний хід увага боса незмінна. Ціль: Голова.");
    expect(journal).toContain("🛢️ <i>Бочковий гуркіт</i> згортається в один удар. Ціль: Голова. Завдано 7 шкоди.");

    const cooling = presentPartyBoss(makeBigBossSession({
      turn: 7,
      warriorTaunt: { cooldowns: { leader: { availableTurn: 9 } } }
    }), { viewerCharacterId: "leader" });
    expect(cooling).toContain("🫁 🛡️ «На мене!» відсапується: ще 2 ходи.");

    const expired = presentPartyBoss(makeBigBossSession({
      roundLog: [{
        turn: 3,
        actions: [],
        bossDamage: 0,
        bossHpAfter: 55,
        bossRetaliations: [{
          characterId: "leader",
          damage: 7,
          hpAfter: 53,
          tauntRedirected: true,
          tauntOriginalKind: "focused"
        }],
        warriorTaunt: {
          redirectedCharacterId: "leader",
          redirectedAttackKind: "focused",
          expiredCharacterId: "leader",
          bossAttacksRemaining: 0
        },
        statusAfter: "active"
      }]
    }));
    expect(expired).toContain("🫥 Виклик згас: Бочка знову дивиться на всю ватагу.");
    expect(expired).not.toContain("🛡️ Увага Бочки: Голова");
  });

  it("stops showing reducer-owned Taunt cooldown exactly at the N + 5 boundary", () => {
    let state = createPartyBossState({
      partySessionId: "presenter-taunt-boundary",
      variant: "big-barrel",
      now: new Date("2026-07-11T10:00:00.000Z"),
      participants: [participant("leader", "Голова")]
    });
    state.participants[0]!.resources.hp = 999;
    state.participants[0]!.resources.hpMax = 999;
    for (let turn = 1; turn <= 5; turn += 1) {
      state = resolvePartyBossRound({
        state,
        now: new Date(`2026-07-11T10:0${turn}:00.000Z`),
        seed: "presenter-taunt-boundary",
        actions: [{ characterId: "leader", action: turn === 1 ? "taunt" : "defend", origin: "manual" }]
      }).state;
    }

    expect(state.turn).toBe(6);
    expect(presentPartyBoss(makeBigBossSession(state), { viewerCharacterId: "leader" }))
      .not.toContain("«На мене!» відсапується");
  });

  it("explains blocked Warrior Taunt callbacks with canonical remaining turns", () => {
    const session = makeBigBossSession({ turn: 7 });
    const text = presentPartyBossAction({
      state: "taunt-unavailable",
      reason: "cooldown",
      availableTurn: 9,
      session
    }, "leader");

    expect(text).toContain("«🛡️ На мене!» ще відсапується: чекати 2 ходи.");
  });

  it("shows the viewer's queued Big Barrel Brother action plan on the active card", () => {
    const base = makeBigBossSession({}, {
      queuedActions: [{
        characterId: "leader",
        turn: 1,
        action: "defend"
      }]
    });
    const defending = presentPartyBoss(base, { viewerCharacterId: "leader" });
    const attacking = presentPartyBoss({
      ...base,
      queuedActions: [{
        characterId: "leader",
        turn: 1,
        action: "attack"
      }]
    }, { viewerCharacterId: "leader" });

    expect(defending).toContain("<b>Голова</b>, ви плануєте захищатися.");
    expect(attacking).toContain("<b>Голова</b>, ви плануєте вдарити.");
    expect(attacking).not.toContain("<b>Голова</b>, що робимо?");
    expect(attacking).not.toContain("Потім Корчма поставить вас у захист.");
  });

  it("does not repeat the auto-defense timer after the viewer queued a Big Barrel item", () => {
    const text = presentPartyBoss(makeBigBossSession({}, {
      queuedActions: [{
        characterId: "leader",
        turn: 1,
        action: "item",
        item: {
          itemId: "item.field-kit",
          name: "Польова аптечка"
        }
      }]
    }), { viewerCharacterId: "leader" });

    expect(text).toContain("<b>Голова</b>, ви плануєте одноразову манатку <i>Польова аптечка</i>.");
    expect(text).not.toContain("⏳ На хід є 23 секунди. Потім Корчма поставить вас у захист.");
  });

  it("names queued Big Barrel Brother skill and gear action plans", () => {
    const gearGrant = getCombatMantokAbilityGrantsByIds({
      grantIds: ["mantok-ability.last-page-rapier"],
      characterLevel: 13
    })[0];
    expect(gearGrant?.combat).toBeDefined();

    const leader = participant("leader", "Голова");
    leader.combatStats.classId = "class.priest";
    leader.combatStats.level = 13;
    leader.equipmentAbilityGrantIds = ["mantok-ability.last-page-rapier"];
    const base = makeBigBossSession({ participants: [leader] });
    const skill = presentPartyBoss({
      ...base,
      queuedActions: [{
        characterId: "leader",
        turn: 1,
        action: "skill"
      }]
    }, { viewerCharacterId: "leader" });
    const gear = presentPartyBoss({
      ...base,
      queuedActions: [{
        characterId: "leader",
        turn: 1,
        action: "gear",
        gearAbility: { profile: gearGrant!.combat!.profile }
      }]
    }, { viewerCharacterId: "leader" });

    expect(skill).toContain("<b>Голова</b>, ви плануєте ✨ <i>Суворе благословення</i>.");
    expect(gear).toContain("<b>Голова</b>, ви плануєте дію спорядження 🖋 <i>Остання сторінка</i>.");
  });

  it("renders the Big Barrel Brother intro as a separate start card", () => {
    const text = presentPartyBossIntro(makeBigBossSession(), "leader");

    expect(text).toContain("🛢️ <b>Старший Брат Бочки втрутився</b>");
    expect(text).toContain("👥 Ватага: Голова, Шкодійка");
    expect(text).toContain("👹 Проти вас: Старший Брат Бочки · рівень 9");
    expect(text).toContain("<i>Порада дня:");
    expect(text).not.toContain("зайдіть у бойову картку");
  });

  it("renders Big Barrel Brother journal hits with player names", () => {
    const leader = participant("leader", "Голова");
    leader.resources.cooldowns = {
      abilities: {
        "ability.race.step-through-the-border": {
          id: "ability.race.step-through-the-border",
          remainingTurns: 4
        }
      }
    };
    leader.combatItems = {
      cooldowns: {
        "item.dense-bandage": {
          itemId: "item.dense-bandage",
          remainingTurns: 4
        }
      }
    };
    const striker = participant("striker", "Шкодійка");
    striker.resources.cooldowns = {
      skill: {
        id: "skill.trick-shot",
        remainingTurns: 3
      }
    };
    const text = presentPartyBossJournal(makeBigBossSession({
      participants: [leader, striker],
      roundLog: [{
        turn: 4,
        actions: [
          {
            characterId: "leader",
            action: "defend",
            origin: "manual",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          },
          {
            characterId: "striker",
            action: "skill",
            origin: "manual",
            outcome: "hit",
            damage: 13,
            manaSpent: 1,
            skillId: "skill.trick-shot"
          }
        ],
        bossDamage: 13,
        bossHpAfter: 42,
        bossRetaliations: [
          { characterId: "leader", damage: 5, hpAfter: 55 },
          { characterId: "striker", damage: 7, hpAfter: 53 }
        ],
        participantsAfter: [
          {
            characterId: "leader",
            status: "active",
            hp: 55,
            hpMax: 60,
            mana: 19,
            manaMax: 20,
            cooldowns: {
              abilities: {
                "ability.race.step-through-the-border": {
                  id: "ability.race.step-through-the-border",
                  remainingTurns: 1
                }
              }
            },
            combatItems: {
              cooldowns: {
                "item.dense-bandage": {
                  itemId: "item.dense-bandage",
                  remainingTurns: 4
                }
              }
            }
          },
          { characterId: "striker", status: "active", hp: 53, hpMax: 60, mana: 20, manaMax: 20 }
        ],
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("📜 <b>Журнал бою</b>");
    expect(text).toContain("Хід <b>4</b> · запис 1/1");
    expect(text).toContain("👹 Старший Брат Бочки після ходу: 42/100");
    expect(text).toContain("▪️ Голова після ходу: HP 55/60 · мана 19/20 ← 🎯 ціль боса");
    expect(text).toContain("▪️ Шкодійка після ходу: HP 53/60 · мана 20/20 ← 🎯 ціль боса");
    expect(text).toContain("<b>Останні дії:</b>");
    expect(text).toContain("Старший Брат Бочки застосував 🛢️ <i>Бочковий гуркіт</i>: Голова отримує 5 шкоди; Шкодійка отримує 7 шкоди.");
    expect(text).toContain("Шкодійка застосовує 🏹 <i>Рикошетний постріл</i>: влучає на 13 шкоди.");
    expect(text).toContain("<b>Кулдауни та ефекти:</b>");
    expect(text).toContain("Голова: 🫁 🌀 <i>Крок крізь Межу</i> відсапується: ще 1 хід.");
    expect(text).toContain("Голова: 🫁 🩹 Щільний бинт відсапується: ще 4 ходи.");
    expect(text).not.toContain("Рикошетний постріл відсапується");
    expect(text).toContain("🎯 На наступний хід увага боса переходить на Шкодійка.");
    expect(text).not.toContain("Бос отримав:");
  });

  it("hides stale cooldown notices for knocked-out participants in Big Barrel Brother journal pages", () => {
    const text = presentPartyBossJournal(makeBigBossSession({
      turn: 7,
      roundLog: [{
        turn: 6,
        actions: [
          {
            characterId: "leader",
            action: "defend",
            origin: "timeout",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 0,
        bossHpAfter: 383,
        bossRetaliations: [
          { characterId: "leader", damage: 20, hpAfter: 0 }
        ],
        participantsAfter: [
          {
            characterId: "leader",
            status: "knocked-out",
            hp: 0,
            hpMax: 60,
            mana: 19,
            manaMax: 20,
            cooldowns: {
              skill: {
                id: "technique.class.bureaucramancer.peer-reviewed-strike",
                remainingTurns: 4
              }
            },
            combatItems: {
              cooldowns: {
                "item.dense-bandage": {
                  itemId: "item.dense-bandage",
                  remainingTurns: 3
                }
              }
            }
          },
          { characterId: "striker", status: "active", hp: 32, hpMax: 60, mana: 20, manaMax: 20 }
        ],
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("Голова після ходу: HP 0/60 · мана 19/20 · вибито");
    expect(text).not.toContain("Голова: 🫁");
    expect(text).not.toContain("Рецензований удар відсапується");
    expect(text).not.toContain("Щільний бинт відсапується");
  });

  it("names the Big Barrel Brother broad attack in the active battle card", () => {
    const text = presentPartyBoss(makeBigBossSession({
      turn: 5,
      roundLog: [{
        turn: 4,
        actions: [
          {
            characterId: "leader",
            action: "attack",
            origin: "manual",
            outcome: "hit",
            damage: 8,
            manaSpent: 0
          },
          {
            characterId: "striker",
            action: "attack",
            origin: "manual",
            outcome: "miss",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 8,
        bossHpAfter: 42,
        bossRetaliations: [
          { characterId: "leader", damage: 5, hpAfter: 55 },
          { characterId: "striker", damage: 7, hpAfter: 53 }
        ],
        statusAfter: "active"
      }]
    }));

    expect(text).toContain("Старший Брат Бочки застосовує 🛢️ <i>Бочковий гуркіт</i>: Голова отримує 5 шкоди; Шкодійка отримує 7 шкоди.");
    expect(text).not.toContain("Старший Брат Бочки зачіпає Голова");
  });

  it("renders the last Big Barrel Brother action like an ordinary battle scene", () => {
    const leader = participant("leader", "Голова");
    const striker = participant("striker", "Шкодійка");
    leader.resources.cooldowns = {
      abilities: {
        "ability.race.step-through-the-border": {
          id: "ability.race.step-through-the-border",
          remainingTurns: 4
        }
      }
    };
    striker.resources.cooldowns = {
      skill: {
        id: "skill.trick-shot",
        remainingTurns: 2
      }
    };
    const text = presentPartyBoss(makeBigBossSession({
      turn: 2,
      participants: [leader, striker],
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "leader",
            action: "race",
            origin: "manual",
            outcome: "hit",
            damage: 10,
            manaSpent: 1,
            skillId: "ability.race.step-through-the-border"
          },
          {
            characterId: "striker",
            action: "defend",
            origin: "timeout",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 10,
        bossHpAfter: 42,
        bossRetaliations: [
          { characterId: "leader", damage: 5, hpAfter: 55 }
        ],
        statusAfter: "active"
      }]
    }), { viewerCharacterId: "leader" });

    expect(text).toContain("Ваше вміння 🌀 <i>Крок крізь Межу</i>: влучає на 10 шкоди.");
    expect(text).toContain("Шкодійка: Корчма не дочекалася вибору й поставила в захист: ворогові важче влучити, а удар буде слабшим.");
    expect(text).toContain("Старший Брат Бочки атакує Голова у відповідь і завдає 5 шкоди.");
    expect(text).toContain("🫁 🌀 <i>Крок крізь Межу</i> відсапується: ще 4 ходи.");
    expect(text).toContain("<b>Останні дії:</b>");
    expect(text.indexOf("🫁 🌀 <i>Крок крізь Межу</i> відсапується")).toBeLessThan(text.indexOf("<b>Останні дії:</b>"));
    expect(text).not.toContain("Рикошетний постріл відсапується");
    expect(text).not.toContain("Ватага зняла");
  });

  it("describes Big Barrel field kit healing as reaching the resulting HP", () => {
    const text = presentPartyBoss(makeBigBossSession({
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "leader",
            action: "item",
            origin: "manual",
            outcome: "item-used",
            damage: 0,
            manaSpent: 0,
            itemName: "Польова аптечка",
            healing: 83,
            hpAfter: 93
          }
        ],
        bossDamage: 0,
        bossHpAfter: 100,
        bossRetaliations: [],
        statusAfter: "active"
      }]
    }), { viewerCharacterId: "leader" });

    expect(text).toContain("Ви застосували 🩺 <b>Польова аптечка</b>. HP підтягнуто до 93.");
    expect(text).not.toContain("Польова аптечка</b>. HP відновлено на 83.");
  });

  it("renders Big Barrel dense bandage item actions with the medical icon", () => {
    const text = presentPartyBoss(makeBigBossSession({
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "leader",
            action: "item",
            origin: "manual",
            outcome: "item-used",
            damage: 0,
            manaSpent: 0,
            itemId: "item.dense-bandage",
            itemName: "Щільний бинт",
            healing: 23,
            hpAfter: 42
          }
        ],
        bossDamage: 0,
        bossHpAfter: 100,
        bossRetaliations: [],
        statusAfter: "active"
      }]
    }), { viewerCharacterId: "striker" });

    expect(text).toContain("Голова застосовує 🩹 <b>Щільний бинт</b>. HP відновлено на 23.");
  });

  it("renders Big Barrel gear support effects on active cards and journal pages", () => {
    const session = makeBigBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "leader",
            action: "gear",
            origin: "manual",
            outcome: "hit",
            damage: 0,
            manaSpent: 0,
            skillId: "gear.barrel-counter-shield",
            guard: 2,
            satedRecovery: { hpRestored: 1, manaRestored: 1 }
          }
        ],
        bossDamage: 0,
        bossHpAfter: 100,
        bossRetaliations: [
          { characterId: "leader", damage: 6, hpAfter: 54 }
        ],
        participantsAfter: [
          { characterId: "leader", status: "active", hp: 54, hpMax: 60, mana: 20, manaMax: 20 },
          { characterId: "striker", status: "active", hp: 60, hpMax: 60, mana: 20, manaMax: 20 }
        ],
        statusAfter: "active"
      }]
    });
    const satedCursorAt = new Date("2026-07-16T13:00:00.000Z");
    session.state.participants[0]!.varenykSated = {
      version: 1,
      activationId: "barrel-journal-sated",
      recipientCharacterId: "leader",
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: new Date(satedCursorAt.getTime() + 12 * 60_000).toISOString(),
      cursorAt: satedCursorAt.toISOString(),
      leaseStartedAt: satedCursorAt.toISOString(),
      outsideRemainderMs: 0,
      pulseIds: ["barrel:pulse:1"]
    };

    const active = presentPartyBoss(session, { viewerCharacterId: "leader" });
    session.state.roundLog[0]!.participantsAfter![0]!.varenykSated = {
      ...session.state.participants[0]!.varenykSated,
      pulseIds: [...session.state.participants[0]!.varenykSated.pulseIds]
    };
    delete session.state.participants[0]!.varenykSated;
    const journal = presentPartyBossJournal(session, 0);

    expect(active).toContain("Ваша дія спорядження 🛡 <i>Бочковий контраргумент</i>: спрацьовує без прямої шкоди. Підтримка: захист тримає 2.");
    expect(journal).toContain("Голова застосовує 🛡 <i>Бочковий контраргумент</i>: спрацьовує без прямої шкоди. Підтримка: захист тримає 2.");
    expect(journal).toContain("😋 Стан: <b>Ситий</b> у <b>Голова</b> ще <b>12 ходів</b>");
    expect(journal.indexOf("<b>Кулдауни та ефекти:</b>")).toBeLessThan(
      journal.indexOf("😋 Стан: <b>Ситий</b> у <b>Голова</b>")
    );
    expect(journal).toContain("😋 Голова: <i>ситість</i> відновлює +1 HP і +1 мани.");
    expect(journal.indexOf("Старший Брат Бочки атакує Голова")).toBeLessThan(
      journal.indexOf("😋 Голова: <i>ситість</i> відновлює")
    );
    expect(active.indexOf("Старший Брат Бочки атакує вас")).toBeLessThan(
      active.indexOf("😋 Голова: <i>ситість</i> відновлює")
    );
  });

  it("keeps identical Sated rows for distinct same-named Big Barrel participants", () => {
    const leader = participant("leader", "Тезко");
    const striker = participant("striker", "Тезко");
    const session = makeBigBossSession({
      participants: [leader, striker],
      roundLog: [{
        turn: 1,
        actions: [],
        bossDamage: 0,
        bossHpAfter: 100,
        bossRetaliations: [],
        participantsAfter: [
          { characterId: "leader", status: "active", hp: 60, hpMax: 60, mana: 20, manaMax: 20 },
          { characterId: "striker", status: "active", hp: 60, hpMax: 60, mana: 20, manaMax: 20 }
        ],
        statusAfter: "active"
      }]
    });
    const cursorAt = "2026-07-16T13:00:00.000Z";
    const makeSated = (characterId: string) => ({
      version: 1 as const,
      activationId: `same-name-${characterId}`,
      recipientCharacterId: characterId,
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: "2026-07-16T13:12:00.000Z",
      cursorAt,
      leaseStartedAt: cursorAt,
      outsideRemainderMs: 0,
      pulseIds: [`same-name:${characterId}:1`]
    });
    session.state.roundLog[0]!.participantsAfter![0]!.varenykSated = makeSated("leader");
    session.state.roundLog[0]!.participantsAfter![1]!.varenykSated = makeSated("striker");

    const journal = presentPartyBossJournal(session, 0);
    const identicalLine = "😋 Стан: <b>Ситий</b> у <b>Тезко</b> ще <b>12 ходів</b>";
    expect(journal.split(identicalLine)).toHaveLength(3);
  });

  it("uses per-round item cooldown snapshots in Big Barrel journal pages", () => {
    const leader = participant("leader", "Голова");
    leader.combatItems = {
      cooldowns: {
        "item.dense-bandage": {
          itemId: "item.dense-bandage",
          remainingTurns: 4
        }
      }
    };
    const session = makeBigBossSession({
      turn: 3,
      participants: [leader, participant("striker", "Шкодійка")],
      roundLog: [
        {
          turn: 1,
          actions: [
            {
              characterId: "leader",
              action: "defend",
              origin: "timeout",
              outcome: "defended",
              damage: 0,
              manaSpent: 0
            }
          ],
          bossDamage: 0,
          bossHpAfter: 100,
          bossRetaliations: [{ characterId: "leader", damage: 17, hpAfter: 43 }],
          participantsAfter: [
            { characterId: "leader", status: "active", hp: 43, hpMax: 60, mana: 20, manaMax: 20 },
            { characterId: "striker", status: "active", hp: 60, hpMax: 60, mana: 20, manaMax: 20 }
          ],
          statusAfter: "active"
        },
        {
          turn: 2,
          actions: [
            {
              characterId: "leader",
              action: "item",
              origin: "manual",
              outcome: "item-used",
              damage: 0,
              manaSpent: 0,
              itemId: "item.dense-bandage",
              itemName: "Щільний бинт",
              healing: 23,
              hpAfter: 60
            }
          ],
          bossDamage: 0,
          bossHpAfter: 100,
          bossRetaliations: [{ characterId: "leader", damage: 17, hpAfter: 43 }],
          participantsAfter: [
            {
              characterId: "leader",
              status: "active",
              hp: 43,
              hpMax: 60,
              mana: 20,
              manaMax: 20,
              combatItems: {
                cooldowns: {
                  "item.dense-bandage": {
                    itemId: "item.dense-bandage",
                    remainingTurns: 5
                  }
                }
              }
            },
            { characterId: "striker", status: "active", hp: 60, hpMax: 60, mana: 20, manaMax: 20 }
          ],
          statusAfter: "active"
        }
      ]
    });

    const firstPage = presentPartyBossJournal(session, 0);
    const secondPage = presentPartyBossJournal(session, 1);

    expect(firstPage).not.toContain("Щільний бинт відсапується");
    expect(secondPage).toContain("Голова: 🫁 🩹 Щільний бинт відсапується: ще 5 ходів.");
  });

  it("uses participant names instead of viewer shorthand on completed Big Barrel Brother cards", () => {
    const leader = participant("leader", "Голова");
    leader.resources = {
      ...leader.resources,
      hp: 0
    };
    leader.status = "knocked-out";
    leader.resources.cooldowns = {
      skill: {
        id: "technique.class.bureaucramancer.peer-reviewed-strike",
        remainingTurns: 2
      }
    };
    const session = makeBigBossSession({
      status: "won",
      participants: [leader, participant("striker", "Шкодійка")]
    });
    session.status = "won";
    session.result = {
      status: "won",
      completedAt: "2026-06-30T10:01:00.000Z",
      bossHpAfter: 0,
      participants: [
        {
          characterId: "leader",
          status: "knocked-out",
          damageDealt: 12,
          submittedActions: 1,
          timeoutActions: 0,
          reward: {
            xp: 2,
            gold: 4,
            itemGrants: []
          }
        }
      ]
    };

    const text = presentPartyBoss(session, { viewerCharacterId: "leader" });

    expect(text).toContain("▫️ Голова: HP 0/60 · мана 20/20 · вибито");
    expect(text).not.toContain("❤️ Ви:");
    expect(text).not.toContain("відсапується");
    expect(text).toContain("Ваша винагорода за рейд:\n<b>+2 XP\n+4 золота</b>");
  });

  it("hides stale viewer cooldowns after the viewer is knocked out of an active Big Barrel Brother raid", () => {
    const leader = participant("leader", "Голова");
    leader.status = "knocked-out";
    leader.resources = {
      ...leader.resources,
      hp: 0,
      cooldowns: {
        skill: {
          id: "technique.class.bureaucramancer.peer-reviewed-strike",
          remainingTurns: 4
        }
      }
    };
    leader.combatItems = {
      cooldowns: {
        "item.dense-bandage": {
          itemId: "item.dense-bandage",
          remainingTurns: 3
        }
      }
    };
    const text = presentPartyBoss(makeBigBossSession({
      turn: 7,
      participants: [leader, participant("striker", "Шкодійка")]
    }), { viewerCharacterId: "leader" });

    expect(text).toContain("❤️ Ви: HP 0/60 · мана 20/20 · вибито");
    expect(text).toContain("Ви вибиті з рейду. Картка лишається для спостереження й оновлення.");
    expect(text).not.toContain("Рецензований удар відсапується");
    expect(text).not.toContain("Щільний бинт відсапується");
  });

  it("does not claim the Big Barrel Brother focus switched when it stayed on the same participant", () => {
    const session = makeBigBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [{
          characterId: "leader",
          action: "attack",
          origin: "manual",
          outcome: "hit",
          damage: 13,
          manaSpent: 0
        }],
        bossDamage: 13,
        bossHpAfter: 42,
        bossRetaliations: [
          { characterId: "leader", damage: 5, hpAfter: 55 }
        ],
        statusAfter: "active"
      }]
    });

    const text = presentPartyBoss(session);
    const journal = presentPartyBossJournal(session);

    expect(text).toContain("Старший Брат Бочки атакує Голова у відповідь і завдає 5 шкоди.");
    expect(text).not.toContain("🎯 Увага боса перемкнулася на Голова.");
    expect(journal).not.toContain("🎯 На наступний хід увага боса переходить на Голова.");
  });

  it("explains a Big Barrel Brother loss with remaining boss HP and attempt XP", () => {
    const leader = participant("leader", "Голова");
    leader.contribution = {
      submittedActions: 1,
      timeoutActions: 0,
      damageDealt: 12,
      damageTaken: 5
    };
    const text = presentPartyBoss(makeBigBossSession({
      status: "lost",
      boss: {
        ...makeBigBossSession().state.boss,
        hp: 104,
        hpMax: 216
      },
      participants: [leader, participant("striker", "Шкодійка")]
    }), { viewerCharacterId: "leader" });

    expect(text).toContain("Стан: Старший Брат Бочки пережив рейд");
    expect(text).toContain("💤 Ватага програла. Старший Брат Бочки вистояв із 104/216 HP.");
    expect(text).toContain("Пива цього разу не виставити");
    expect(text).toContain("🎒 За спробу:\n+10 XP");
  });

  it("renders a Big Barrel Brother victory with the viewer's stored rewards", () => {
    const session = makeBigBossSession({
      status: "won",
      completedAt: "2026-06-30T10:01:00.000Z",
      boss: {
        ...makeBigBossSession().state.boss,
        hp: 0,
        hpMax: 216
      }
    });
    session.status = "won";
    session.completedAt = new Date("2026-06-30T10:01:00.000Z");
    session.result = {
      status: "won",
      completedAt: "2026-06-30T10:01:00.000Z",
      bossHpAfter: 0,
      participants: [
        {
          characterId: "leader",
          status: "active",
          damageDealt: 12,
          submittedActions: 1,
          timeoutActions: 0,
          reward: {
            xp: 2,
            gold: 4,
            itemGrants: [
              {
                itemId: "item.self-check-mirror",
                name: "Дзеркальце Самоперевірки",
                quantity: 1
              }
            ]
          }
        }
      ]
    };

    const text = presentPartyBoss(session, { viewerCharacterId: "leader" });

    expect(text).toContain("🎉 Ватага перемогла. Проблема закрита, журнал задоволено хрумтить сторінкою.");
    expect(text).toContain("Ваша винагорода за рейд:\n<b>+2 XP\n+4 золота</b>");
    expect(text).toContain("</b>\n\nЗдобуто: <i>Дзеркальце Самоперевірки</i>");
    expect(text).not.toContain("нагороди збережено");
  });

  it("renders a public Big Barrel Brother victory with the total raid reward", () => {
    const session = makeBigBossSession({
      status: "won",
      completedAt: "2026-06-30T10:01:00.000Z",
      boss: {
        ...makeBigBossSession().state.boss,
        hp: 0,
        hpMax: 216
      }
    });
    session.status = "won";
    session.completedAt = new Date("2026-06-30T10:01:00.000Z");
    session.result = {
      status: "won",
      completedAt: "2026-06-30T10:01:00.000Z",
      bossHpAfter: 0,
      participants: [
        {
          characterId: "leader",
          status: "active",
          damageDealt: 12,
          submittedActions: 1,
          timeoutActions: 0,
          reward: {
            xp: 2,
            gold: 4,
            itemGrants: [
              {
                itemId: "item.self-check-mirror",
                name: "Дзеркальце Самоперевірки",
                quantity: 1
              }
            ]
          }
        },
        {
          characterId: "striker",
          status: "active",
          damageDealt: 18,
          submittedActions: 1,
          timeoutActions: 0,
          reward: {
            xp: 3,
            gold: 5,
            itemGrants: [
              {
                itemId: "item.self-check-mirror",
                name: "Дзеркальце Самоперевірки",
                quantity: 2
              }
            ]
          }
        }
      ]
    };

    const text = presentPartyBoss(session);
    const bystanderText = presentPartyBoss(session, { viewerCharacterId: "bystander" });

    expect(text).toContain("🎉 Ватага перемогла. Проблема закрита, журнал задоволено хрумтить сторінкою.");
    expect(text).toContain("Загальна винагорода рейду:\n<b>+5 XP\n+9 золота</b>");
    expect(text).toContain("</b>\n\nЗдобуто загалом: <i>Дзеркальце Самоперевірки ×3</i>");
    expect(text).not.toContain("Ваша винагорода за рейд:");
    expect(bystanderText).toContain("Загальна винагорода рейду:\n<b>+5 XP\n+9 золота</b>");
    expect(bystanderText).not.toContain("Ваша винагорода за рейд:");
  });

  it("renders a forwardable Big Barrel Brother invite card with visible URL and rotating text", () => {
    expect(BIG_BARREL_INVITE_TEMPLATES).toHaveLength(13);

    const session = makePartySession();
    const initial = getInitialBigBarrelInviteTemplateIndex(session.inviteToken);
    const next = getNextBigBarrelInviteTemplateIndex(session.inviteToken, initial);
    const firstText = presentPartyInviteShare(
      session,
      "https://t.me/kvestarnia_test_bot?start=party_partyBIG12",
      { templateIndex: initial }
    );
    const nextText = presentPartyInviteShare(
      session,
      "https://t.me/kvestarnia_test_bot?start=party_partyBIG12",
      { templateIndex: next }
    );

    expect(firstText).toContain("https://t.me/kvestarnia_test_bot?start=party_partyBIG12");
    expect(firstText).toContain("Ватажок: <b>Голова</b>");
    expect(firstText).toContain("Учасників: <b>2/8</b>");
    expect(nextText).not.toBe(firstText);
  });

  it("renders stable rotating Big Barrel Brother approach notices", () => {
    expect(BIG_BARREL_APPROACH_TEMPLATES).toHaveLength(13);

    const initial = getInitialBigBarrelApproachTemplateIndex("partyBIG12");
    const next = getNextBigBarrelApproachTemplateIndex("partyBIG12", initial);
    const firstText = presentBigBarrelApproachNotice("partyBIG12", { templateIndex: initial });
    const nextText = presentBigBarrelApproachNotice("partyBIG12", { templateIndex: next });

    expect(firstText).toContain("Ви підійшли до Бочки Пінного Міражу.");
    expect(firstText).toContain("ватаг");
    expect(firstText).toContain("рейд");
    expect(nextText).not.toBe(firstText);
  });

  it("keeps the Big Barrel Brother recruiting card free of the invite URL", () => {
    const session = makePartySession();
    const text = presentPartySession(session, {
      inviteUrl: "https://t.me/kvestarnia_test_bot?start=party_partyBIG12"
    });
    const createdText = presentPartyCreate({ state: "created", session }, {
      inviteUrl: "https://t.me/kvestarnia_test_bot?start=party_partyBIG12"
    });

    expect(text).toContain("🛢️ <b>Збір до Старшого Брата Бочки</b>");
    expect(text).toContain("Лідер ватаги може почати бій раніше.");
    expect(text).not.toContain("Запрошення:");
    expect(text).not.toContain("https://t.me/kvestarnia_test_bot?start=party_partyBIG12");
    expect(text).not.toContain("Бочку довго ображали словом «меблі»");
    expect(createdText).not.toContain("Бочку довго ображали словом «меблі»");
  });

  it("shows Big Barrel Brother readiness markers near recruiting participant names", () => {
    const session = {
      ...makePartySession(),
      participants: makePartySession().participants.map((participant, index) => ({
        ...participant,
        readiness: index === 0 ? "ready" as const : "waiting" as const
      }))
    };

    const text = presentPartySession(session);

    expect(text).toContain("1. ✅ <b>Голова</b>");
    expect(text).toContain("2. ⏳ <b>Шкодійка</b>");
  });

  it("shows Bureaucramancer protocol signature count without signer names on recruiting cards", () => {
    const session = {
      ...makePartySession(),
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b" as const,
        protocolId: "protocol-party-big",
        filerCharacterId: "leader",
        signatureCount: 2,
        manaCost: 5,
        filedAt: new Date("2026-06-30T10:01:00.000Z")
      }
    };

    const text = presentPartySession(session);

    expect(text).toContain("📄 Протокол 13-З відкрито. Підписів: 2.");
    expect(text).not.toContain("Перший персональний удар Бочки по підписанту піде в папери, а не в ребра.");
    expect(text).not.toContain("Підписанти:");
  });

  it("explains why Big Barrel Brother joins are ineligible", () => {
    const session = makePartySession();

    expect(presentPartyJoin({ state: "ineligible", reason: "level-gate", session })).toContain("від 8 рівня");
    expect(presentPartyJoin({ state: "ineligible", reason: "active-combat", session })).toContain("в активному бою");
    expect(presentPartyJoin({ state: "ineligible", reason: "already-completed", session })).toContain("вже зарахована");
    const cooldownText = presentPartyJoin({
      state: "ineligible",
      reason: "loss-cooldown",
      availableAt: new Date("2026-06-30T10:02:00.000Z"),
      now: new Date("2026-06-30T10:00:00.000Z"),
      session
    });
    expect(cooldownText).toContain("короткий перепочинок");
    expect(cooldownText).toContain("2 хвилини");
    expect(presentPartyJoin({ state: "ineligible", session })).toContain("правильною печаткою");
  });
});

function makeBigBossSession(
  stateOverrides: Partial<PartyBossSessionRecord["state"]> = {},
  sessionOverrides: Partial<PartyBossSessionRecord> = {}
): PartyBossSessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const state: PartyBossSessionRecord["state"] = {
    rulesVersion: "big-barrel-brother-v1",
    partySessionId: "party-big",
    status: "active",
    turn: 1,
    boss: {
      monsterId: "big-barrel-brother",
      name: "Старший Брат Бочки",
      level: 9,
      hp: 55,
      hpMax: 100,
      attack: 14,
      armor: 4,
      resist: 2,
      dexterity: 8,
      tags: ["boss", "barrel"]
    },
    participants: [
      participant("leader", "Голова"),
      participant("striker", "Шкодійка")
    ],
    roundLog: [],
    startedAt: now.toISOString(),
    ...stateOverrides
  };

  return {
    id: "boss-big",
    partySessionId: "party-big",
    partyInviteToken: "partyBIG12",
    leaderCharacterId: "leader",
    status: state.status,
    turn: state.turn,
    version: 1,
    rulesVersion: "big-barrel-brother-v1",
    bossKey: "big-barrel-brother",
    state,
    result: null,
    turnExpiresAt: new Date("2026-06-30T10:00:23.000Z"),
    completedAt: null,
    participants: [
      bossParticipantSnapshot("leader", "Голова", 42n),
      bossParticipantSnapshot("striker", "Шкодійка", 93n)
    ],
    ...sessionOverrides
  };
}

function bossParticipantSnapshot(
  id: string,
  name: string,
  telegramUserId: bigint
): PartyBossSessionRecord["participants"][number] {
  return {
    ...makePartyCharacter(id, name, telegramUserId),
    remortCount: 0
  };
}

function participant(
  characterId: string,
  name: string
): PartyBossSessionRecord["state"]["participants"][number] {
  return {
    characterId,
    name,
    remortCount: 0,
    status: "active",
    combatStats: {
      level: 8,
      hpMax: 60,
      manaMax: 20,
      hpCurrent: 60,
      manaCurrent: 20,
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      charisma: 10,
      luck: 10,
      raceId: "race.human-ish",
      classId: "class.warrior"
    },
    resources: {
      hp: 60,
      hpMax: 60,
      mana: 20,
      manaMax: 20
    },
    contribution: {
      submittedActions: 0,
      timeoutActions: 0,
      damageDealt: 0,
      damageTaken: 0
    }
  };
}

function makePartySession(): PartySessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const leader = makePartyCharacter("leader", "Голова", 42n);
  const member = makePartyCharacter("striker", "Шкодійка", 93n);

  return {
    id: "party-big",
    inviteToken: "partyBIG12",
    status: "recruiting",
    leaderCharacterId: leader.id,
    periodId: "12026-06-30T10:23",
    originLocationId: "barrel.big-brother",
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-30T10:13:00.000Z"),
    expiresAt: new Date("2026-06-30T10:13:00.000Z"),
    version: 1,
    activeLeaderKey: "party-leader:leader",
    createdAt: now,
    updatedAt: now,
    leader,
    participants: [
      partyParticipant("participant-leader", leader, now),
      partyParticipant("participant-striker", member, now)
    ]
  };
}

function partyParticipant(
  id: string,
  character: PartySessionRecord["leader"],
  joinedAt: Date
): PartySessionRecord["participants"][number] {
  return {
    id,
    sessionId: "party-big",
    characterId: character.id,
    remortCount: 0,
    status: "joined",
    joinSource: "nearby",
    joinedAt,
    leftAt: null,
    chatId: character.telegramUserId,
    messageId: 13,
    character
  };
}

function makePartyCharacter(
  id: string,
  name: string,
  telegramUserId: bigint
): PartySessionRecord["leader"] {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
    currentLocationId: "location.korchma.barrel",
    name,
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 8,
    xp: 42,
    gold: 13,
    hpCurrent: 60,
    hpMax: 60,
    manaCurrent: 20,
    manaMax: 20,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };
}
