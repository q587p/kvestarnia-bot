import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const moduleDir = "src/bot/modules";
const featureModuleOwners = {
  "raidChat.ts": [],
  "core.ts": ["/^v1:menu:/", "/^v1:help:/", "/^v1:dh:/", "/^v1:news:/", "/^v1:lore:/"],
  "character.ts": ["/^v1:onb:/", "/^v1:bst:/", "/^v1:ach:/", "/^v1:devreset:/", "/^v1:restart:/", "/^v1:rm:/"],
  "inventory.ts": ["/^v1:equip:/", "/^v1:item:/", "/^v1:use:/", "/^v1:craft:/", "/^v1:up:/", "/^v1:chest:/", "/^v1:lvlx:/"],
  "tavern.ts": ["/^v1:sh:/", "/^v1:tavern:/", "/^v1:place:/", "/^v1:tour:/", "/^v1:mem:/", "/^v1:ev:/", "/^v[12]:cellar:/"],
  "quest.ts": ["/^v[12]:adv:/", "/^v1:quest:/", "/^v1:dkr:/", "/^v1:hunt:/", "/^v1:ygr:/"],
  "combat.ts": ["/^v1:spar:/", "/^v1:fight:/", "/^v1:search:/"],
  "social.ts": ["/^v[12]:gc:/", "/^v1:gift:/", "/^v1:post:/", "/^v1:duel:/", "/^v1:nd:/", "/^v1:nc:/", "/^v1:party:/"]
};

const expectedCallbackInventory = Object.values(featureModuleOwners).flat();
const expectedCommandRegistrationCalls = [
  "registerOnlineCommand",
  "registerLookCommand",
  "registerHelpCommand",
  "registerNewsCommand",
  "registerLoreBoardCommand",
  "registerSupportCommand",
  "registerVersionCommand",
  "registerPlannedCommands",
  "registerBestiaryCommand",
  "registerStartCommand",
  "registerHeroCommand",
  "registerDevGrantCommands",
  "registerDevHpRecoveryCommand",
  "registerDevResetCommand",
  "registerRestartCommand",
  "registerRemortCommand",
  "registerInventoryCommand",
  "registerEquipmentCommand",
  "registerCellarCommand",
  "registerTavernCommand",
  "registerLatestEventsCommand",
  "registerAdventureCommand",
  "registerHuntCommand",
  "registerQuestHubCommand",
  "registerFightCommand",
  "registerTrainingDoppelgangerCommand",
  "registerDuelCommand",
  "registerPartySessionDevCommand",
  "registerGroupCombatDevCommand"
];

const expectedCommandAliasInventory = [
  "adventure",
  "bag",
  "bestiary",
  "cancel_raid_chat",
  "cellar",
  "chronicles",
  "dev_add_bandage",
  "dev_add_dense_bandage",
  "dev_add_field_kit",
  "dev_add_gold",
  "dev_add_iskrokamin",
  "dev_add_item",
  "dev_add_level",
  "dev_add_random_item",
  "dev_add_xp",
  "dev_add_yeger_line",
  "dev_adventure_reset",
  "dev_finish_attunements",
  "dev_group_combat",
  "dev_heal",
  "dev_help",
  "dev_hp_recovery_due",
  "dev_party",
  "dev_raid_chat",
  "dev_raid_reset",
  "dev_raid_stop",
  "dev_raid_win",
  "dev_reset_bureaucramancer_protocol",
  "dev_reset_cellar_mouse",
  "dev_reset_korchma_round",
  "dev_reset_me",
  "dev_reset_monster_rest",
  "dev_reset_priest_blessing",
  "dev_reset_quiet_pocket",
  "dev_reset_rogue",
  "dev_reset_varenyk_sated",
  "dev_reset_yeger_bandage",
  "dev_reset_yeger_bandage_day",
  "dev_reset_yeger_trail",
  "dev_restore_mana",
  "dev_two_enemies",
  "dev_yeger_first_done",
  "dev_yeger_second_done",
  "duel",
  "equip",
  "equipment",
  "fight",
  "gear",
  "guild",
  "help",
  "hero",
  "hunt",
  "inventory",
  "items",
  "look",
  "lore",
  "me",
  "monsters",
  "news",
  "online",
  "profile",
  "quest",
  "raid",
  "remort",
  "restart",
  "spar",
  "start",
  "support",
  "tavern",
  "version"
];

describe("0.2.2 architecture stabilization scope", () => {
  it("keeps createBot as an orchestration shell with ordered module invocation", () => {
    const source = read("src/bot/createBot.ts");
    const expectedRegistrars = [
      "registerRaidChatBotModule",
      "registerCoreBotModule",
      "registerCharacterBotModule",
      "registerInventoryBotModule",
      "registerTavernBotModule",
      "registerQuestBotModule",
      "registerCombatBotModule",
      "registerSocialBotModule"
    ];

    expect(source).toContain("installMessageFreshnessTracking(bot)");
    expect(source).toContain("registerCombatLockMiddleware(bot, services)");
    expect(source).toContain("registerPresenceMiddleware(bot, services.presence)");
    expect(source).not.toMatch(/\.\/(?:callbacks|commands|keyboards|presenters)\//);

    let previousIndex = -1;
    for (const registrar of expectedRegistrars) {
      const invocation = `${registrar}(bot, { services, options })`;
      expect(countOccurrences(source, invocation)).toBe(1);
      const nextIndex = source.indexOf(invocation);
      expect(nextIndex).toBeGreaterThan(previousIndex);
      previousIndex = nextIndex;
    }
  });

  it("keeps src/bot.ts delegated to application factories", () => {
    const source = read("src/bot.ts");

    expect(source).toContain("createRepositories(prisma, {");
    expect(source).toContain("hpRecoveryNotificationsEnabled: config.hpRecoveryNotificationsEnabled");
    expect(source).toContain("createServices(repositories, config)");
    expect(source).toContain("createRuntime({");
    expect(source).not.toMatch(/db\/repositories|services\//);
    expect(source).not.toMatch(/new Prisma|new \w+Service/);
  });

  it("uses explicit bot module files instead of a central feature router", () => {
    const moduleFiles = readdirSync(join(root, moduleDir))
      .filter((file) => file.endsWith(".ts"))
      .sort();

    expect(moduleFiles).toEqual([
      "barrelRaidCompletionScheduler.ts",
      "character.ts",
      "combat.ts",
      "core.ts",
      "inventory.ts",
      "levelUp.ts",
      "mainMenu.ts",
      "notifications.ts",
      "passageSearchGuard.ts",
      "persistentFightNavigation.ts",
      "quest.ts",
      "questHubOptions.ts",
      "raidChat.ts",
      "scenePresence.ts",
      "social.ts",
      "tavern.ts",
      "types.ts"
    ]);
    expect(existsSync(join(root, "src/bot/featureRegistrars.ts"))).toBe(false);
  });

  it("registers each callback namespace in exactly one feature module", () => {
    const owners = new Map<string, string>();

    for (const [file, expectedPrefixes] of Object.entries(featureModuleOwners)) {
      const matches = callbackPrefixes(read(join(moduleDir, file)));
      expect(matches).toEqual(expectedPrefixes);
      for (const prefix of matches) {
        expect(owners.has(prefix)).toBe(false);
        owners.set(prefix, file);
      }
    }

    expect([...owners.keys()]).toEqual(expectedCallbackInventory);
  });

  it("keeps command and alias inventory unchanged", () => {
    const moduleSources = Object.keys(featureModuleOwners)
      .map((file) => read(join(moduleDir, file)))
      .join("\n");
    const commandCalls = [
      ...moduleSources.matchAll(/\b(register[A-Z]\w+Command(?:s)?)\(/g)
    ].map((match) => match[1]);
    expect(commandCalls).toEqual(expectedCommandRegistrationCalls);

    const commandSource = readdirSync(join(root, "src/bot/commands"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => read(join("src/bot/commands", file)))
      .join("\n");
    expect(commandAliases(commandSource)).toEqual(expectedCommandAliasInventory);
  });

  it("keeps feature modules out of unrelated central barrels and runtime cycles", () => {
    const featureModuleFiles = Object.keys(featureModuleOwners);
    for (const file of featureModuleFiles) {
      const source = read(join(moduleDir, file));
      expect(source).not.toMatch(/from "\.\/(?:character|combat|core|inventory|quest|social|tavern)"/);
      expect(source).not.toMatch(/from "\.\.\/(?:callbacks|commands|keyboards|presenters)"$/m);
    }

    expect(findModuleCycles()).toEqual([]);
  });
});

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function callbackPrefixes(source: string): string[] {
  return [
    ...source.matchAll(/bot\.callbackQuery\(\s*(\/\^[^/]+\/)/g),
    ...source.matchAll(/registerParsedCallbackRoute\(\s*bot,\s*(\/\^[^/]+\/)/g)
  ].map((match) => match[1]);
}

function commandAliases(source: string): string[] {
  const aliases = new Set<string>();

  for (const arrayMatch of source.matchAll(/bot\.command\(\s*\[([^\]]+)\]/gs)) {
    for (const aliasMatch of (arrayMatch[1] ?? "").matchAll(/"([^"]+)"/g)) {
      aliases.add(aliasMatch[1] ?? "");
    }
  }

  for (const match of source.matchAll(/bot\.command\(\s*"([^"]+)"/g)) {
    aliases.add(match[1] ?? "");
  }

  for (const plannedList of source.matchAll(/plannedCommands\s*=\s*\[([^\]]+)\]/g)) {
    for (const aliasMatch of (plannedList[1] ?? "").matchAll(/"([^"]+)"/g)) {
      aliases.add(aliasMatch[1] ?? "");
    }
  }

  return [...aliases].sort();
}

function findModuleCycles(): string[][] {
  const graph = new Map<string, string[]>();
  const moduleFiles = readdirSync(join(root, moduleDir)).filter((file) => file.endsWith(".ts"));

  for (const file of moduleFiles) {
    const source = read(join(moduleDir, file));
    const imports = [...source.matchAll(/from "\.\/([^"]+)"/g)]
      .map((match) => `${match[1]}.ts`)
      .filter((target) => moduleFiles.includes(target));
    graph.set(file, imports);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(file: string): void {
    if (visited.has(file)) {
      return;
    }
    if (visiting.has(file)) {
      cycles.push(stack.slice(stack.indexOf(file)).concat(file));
      return;
    }

    visiting.add(file);
    stack.push(file);
    for (const next of graph.get(file) ?? []) {
      visit(next);
    }
    stack.pop();
    visiting.delete(file);
    visited.add(file);
  }

  for (const file of moduleFiles) {
    visit(file);
  }

  return cycles.map((cycle) => cycle.map((file) => normalize(file)));
}

function countOccurrences(source: string, text: string): number {
  return source.split(text).length - 1;
}
