import { describe, expect, it } from "vitest";
import {
  buildQuestHubCommandOptions,
  type BotServices
} from "../../src/bot/createBot";

describe("quest hub routing", () => {
  it("passes the grownup cellar service through shared quest hub options", () => {
    const cellarGrownup = {};
    const options = buildQuestHubCommandOptions({
      adventure: {},
      cellarErrand: {},
      cellarGrownup,
      fight: {},
      hunt: {},
      presence: {},
      tavern: {}
    } as BotServices);

    expect(options.cellarGrownup).toBe(cellarGrownup);
  });

  it("omits the grownup cellar service only when the bot was built without it", () => {
    const options = buildQuestHubCommandOptions({
      adventure: {},
      cellarErrand: {},
      fight: {},
      hunt: {},
      presence: {},
      tavern: {}
    } as BotServices);

    expect(options.cellarGrownup).toBeUndefined();
  });
});
