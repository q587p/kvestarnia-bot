# Аудит переходу Квестарні з 0.3.x до 0.4.x

Дата аудиту: `12026-07-20`.

База аудиту:

- `main`: `d101867cd80f9c05505899ac7b42adf92e369527` (`0.3.14`);
- draft PR `#179`: `e223073a65b96a293ca40ed8e6f14e4bef1b930d`
  (`0.3.15` candidate).

Це історичний пакет аналізу. Поточні рішення вже перенесені до канонічних
roadmap, architecture, design, task і workflow docs.

## Що v2 виправив

Перша версія згорнула Старий жертовник, greeting buff, їжу, consumables і
resale/recycling в один deferred-булет. V2 повернув окремі bounded адреси
`0.4.5`–`0.4.11`, додав activation gates для каталогу/алгоритму й пересунув
data-gated cosmetic guild progression на `0.4.12`.

V2 повністю замінює v1. Superseded v1, generated `PATCH.diff`, whole-repository
`repo-files/` snapshot, copied references і одноразові integration prompts
видалені: Git history зберігає їх без дублювання в пошуку документації.

## Збережено

- [`analysis/`](analysis/) — унікальні висновки, evidence і traceability;
- [`manifest.md`](manifest.md) — історична база та склад retained package;
- [`checks.md`](checks.md) — перевірки й межі тверджень на дату аудиту.

Почніть з [`analysis/executive-summary-uk.md`](analysis/executive-summary-uk.md),
[`analysis/recommended-sequence.md`](analysis/recommended-sequence.md) та
[`analysis/social-economy-catchup.md`](analysis/social-economy-catchup.md).
