#!/usr/bin/env python3
from __future__ import annotations

import glob
import os
from collections import Counter, defaultdict

from extrair_classes_dex import parse_dex

APP_PREFIX = "cicero.minhasfinancas."


def load_app_classes() -> list[str]:
    classes = set()
    for dex in sorted(glob.glob("classes*.dex")):
        for c in parse_dex(dex).classes:
            if c.startswith(APP_PREFIX):
                classes.add(c)
    return sorted(classes)


def by_prefix(classes: list[str], token: str) -> list[str]:
    return sorted([c for c in classes if token in c])


def group_activities(activities: list[str]) -> list[tuple[str, int]]:
    counter = Counter()
    for a in activities:
        parts = a.split(".")
        # cicero.minhasfinancas.activity.<modulo>.<Classe>
        if len(parts) >= 5 and parts[2] == "activity":
            key = f"activity.{parts[3]}"
        elif len(parts) >= 4 and parts[2] == "activity":
            key = "activity.root"
        else:
            key = "outros"
        counter[key] += 1
    return counter.most_common()


def list_layouts() -> list[str]:
    out = []
    for path in sorted(glob.glob("res/layout*.xml") + glob.glob("res/layout/*.xml") + glob.glob("res/layout-land/*.xml")):
        out.append(path)
    # dedupe preserving order
    dedup = []
    seen = set()
    for p in out:
        if p not in seen:
            seen.add(p)
            dedup.append(p)
    return dedup


def main() -> int:
    classes = load_app_classes()

    activities = [c for c in classes if ".activity." in c and c.endswith("Activity")]
    fragments = [c for c in classes if ".fragment." in c and c.endswith("Fragment")]
    dialogs = [c for c in classes if ".dialog." in c and (c.endswith("Dialog") or c.endswith("DialogFragment"))]
    adapters = by_prefix(classes, ".adapter.")
    services = [c for c in classes if ".service." in c or c.endswith("Service")]
    receivers = [c for c in classes if ".receiver." in c or c.endswith("Receiver")]

    layouts = list_layouts()

    lines: list[str] = []
    lines.append("# Estrutura de páginas e módulos (extraída dos DEX)\n")
    lines.append("Mapeamento estrutural inferido por nomes de classes e layouts.\n")
    lines.append(f"- Classes do app identificadas: {len(classes)}")
    lines.append(f"- Activities: {len(activities)}")
    lines.append(f"- Fragments: {len(fragments)}")
    lines.append(f"- Dialogs/DialogFragments: {len(dialogs)}")
    lines.append(f"- Adapters: {len(adapters)}")
    lines.append(f"- Services (heurístico): {len(services)}")
    lines.append(f"- Receivers (heurístico): {len(receivers)}")
    lines.append(f"- Layouts XML encontrados: {len(layouts)}\n")

    lines.append("## Módulos de Activity (por pacote)")
    for mod, count in group_activities(activities):
        lines.append(f"- `{mod}`: {count}")

    lines.append("\n## Principais páginas (amostra de Activities)")
    for a in activities[:120]:
        lines.append(f"- `{a}`")
    if len(activities) > 120:
        lines.append(f"- ... e mais {len(activities) - 120} activities")

    lines.append("\n## Fragments (amostra)")
    for f in fragments[:80]:
        lines.append(f"- `{f}`")
    if len(fragments) > 80:
        lines.append(f"- ... e mais {len(fragments) - 80} fragments")

    lines.append("\n## Dialogs/DialogFragments (amostra)")
    for d in dialogs[:80]:
        lines.append(f"- `{d}`")
    if len(dialogs) > 80:
        lines.append(f"- ... e mais {len(dialogs) - 80} dialogs")

    lines.append("\n## Layouts de UI (amostra)")
    for l in layouts[:120]:
        lines.append(f"- `{l}`")
    if len(layouts) > 120:
        lines.append(f"- ... e mais {len(layouts) - 120} layouts")

    lines.append("\n## Leitura prática da lógica de páginas")
    lines.append("- A navegação principal parece orientada a `activity.*` com módulos dedicados (ex.: cartão, conta, categoria, configuração).")
    lines.append("- Há separação de telas por domínio financeiro e componentes de suporte (`fragment`, `dialog`, `adapter`).")
    lines.append("- Sem decompilação de métodos, a lógica de negócio detalhada (regras/if/loops) não é recuperada integralmente; porém o desenho arquitetural de telas e módulos é observável.")

    with open("PAGINAS_E_ESTRUTURA.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("Relatório salvo em: PAGINAS_E_ESTRUTURA.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
