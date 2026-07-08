Use $kvestarnia-version-task.

Task: implement the narrow Bureaucramancer personal-protocol slice from `docs/tasks/0.3.x-bureaucramancer-personal-protocol.md`.

Before editing, fetch `origin/main`, inspect the current Big Barrel Brother / party-boss recruiting and combat code, and retarget the version number if the active branch already uses this placeholder.

Implement `technique.class.bureaucramancer.personal-protocol-13b` only:

- level 3+ `class.bureaucramancer` can open `Протокол 13-Б: персональні претензії` during live Big Barrel Brother recruiting;
- filing costs 5 mana, starts a 93-minute actor cooldown after successful mutation, creates at most one protocol per recruiting session and auto-signs the filer;
- joined participants can sign once before raid start;
- signing is free and public UI shows only signature count, not signer names;
- when the resulting fight starts, carry the signer set into party-boss runtime;
- for each signer, block the first eligible personal/single-target boss attack against that signer, set immediate damage from that boss action to `0`, store prevented damage, then mark only that signer's protection spent;
- do not block broad/special/all-party attacks such as `Бочковий гуркіт`;
- later personal attacks against the same signer and all attacks against unsigned participants are unaffected;
- store trigger results for replay/journal and never recalculate/retrigger on refresh;
- add short Ukrainian player-facing copy and update the Bureaucramancer Lore Board entry;
- add focused tests and release/docs surfaces from the task doc.

Do not add a new location, class, race, market, paperwork engine, item crafting, quest reroll, public signer list, reward power, shared raid-wide mitigation, or native combat ability change.

If Kharakternyk ward signs or another one-shot raid-prep mitigation already exists on the target branch, document the scope split and ensure the same damage event is not reduced twice.

Run focused tests plus `npm run check`, or document exactly what could not be run.
