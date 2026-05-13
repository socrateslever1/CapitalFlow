#!/usr/bin/env python3
from __future__ import annotations

import argparse
import collections
import glob
import os
import struct
from dataclasses import dataclass


@dataclass
class DexIndex:
    path: str
    classes: list[str]


def read_u32(data: bytes, off: int) -> int:
    return struct.unpack_from('<I', data, off)[0]


def read_uleb128(data: bytes, off: int) -> tuple[int, int]:
    result = 0
    shift = 0
    cur = off
    while True:
        b = data[cur]
        cur += 1
        result |= (b & 0x7F) << shift
        if (b & 0x80) == 0:
            break
        shift += 7
    return result, cur


def read_mutf8_string(data: bytes, off: int) -> str:
    # string_data_item: uleb128 utf16_size + modified utf8 bytes + '\x00'
    _, cur = read_uleb128(data, off)
    end = data.index(0, cur)
    raw = data[cur:end]
    try:
        return raw.decode('utf-8', errors='replace')
    except Exception:
        return raw.decode('latin-1', errors='replace')


def descriptor_to_classname(desc: str) -> str:
    if desc.startswith('L') and desc.endswith(';'):
        return desc[1:-1].replace('/', '.')
    return desc


def parse_dex(path: str) -> DexIndex:
    data = open(path, 'rb').read()
    if not data.startswith(b'dex\n'):
        raise ValueError(f'{path}: arquivo não parece DEX (magic inválida)')

    string_ids_size = read_u32(data, 0x38)
    string_ids_off = read_u32(data, 0x3C)
    type_ids_size = read_u32(data, 0x40)
    type_ids_off = read_u32(data, 0x44)
    class_defs_size = read_u32(data, 0x60)
    class_defs_off = read_u32(data, 0x64)

    strings: list[str] = []
    for i in range(string_ids_size):
        str_off = read_u32(data, string_ids_off + i * 4)
        strings.append(read_mutf8_string(data, str_off))

    type_desc_idx: list[int] = []
    for i in range(type_ids_size):
        type_desc_idx.append(read_u32(data, type_ids_off + i * 4))

    classes: list[str] = []
    for i in range(class_defs_size):
        item_off = class_defs_off + i * 32
        class_idx = read_u32(data, item_off)
        if class_idx >= len(type_desc_idx):
            continue
        descriptor_idx = type_desc_idx[class_idx]
        if descriptor_idx >= len(strings):
            continue
        classes.append(descriptor_to_classname(strings[descriptor_idx]))

    classes = sorted(set(classes))
    return DexIndex(path=path, classes=classes)


def top_packages(classes: list[str], depth: int = 3) -> list[tuple[str, int]]:
    counter: collections.Counter[str] = collections.Counter()
    for cls in classes:
        parts = cls.split('.')
        pkg = '.'.join(parts[:depth]) if len(parts) >= depth else cls
        counter[pkg] += 1
    return counter.most_common(20)


def main() -> int:
    ap = argparse.ArgumentParser(description='Extrai classes de arquivos .dex')
    ap.add_argument('--glob', default='classes*.dex', help='Padrão de arquivos DEX')
    ap.add_argument('--out', default='DEX_UNPACK_SUMMARY.md', help='Arquivo de saída markdown')
    args = ap.parse_args()

    paths = sorted(glob.glob(args.glob))
    if not paths:
        raise SystemExit(f'Nenhum arquivo encontrado para padrão: {args.glob}')

    dexes: list[DexIndex] = [parse_dex(p) for p in paths]

    all_classes: list[str] = []
    for d in dexes:
        all_classes.extend(d.classes)
    all_classes = sorted(set(all_classes))

    lines: list[str] = []
    lines.append('# Descompactação de arquivos .dex (índice de classes)\n')
    lines.append('Relatório gerado por `scripts/extrair_classes_dex.py`.\n')
    lines.append(f'- Arquivos analisados: {len(dexes)}')
    lines.append(f'- Classes únicas totais: {len(all_classes)}\n')

    lines.append('## Classes por arquivo DEX')
    for d in dexes:
        lines.append(f'- `{d.path}`: {len(d.classes)} classes')

    lines.append('\n## Top pacotes (prefixo de 3 níveis)')
    for pkg, count in top_packages(all_classes, depth=3):
        lines.append(f'- `{pkg}`: {count}')

    lines.append('\n## Amostra de classes do app (`cicero.minhasfinancas`)')
    app_classes = [c for c in all_classes if c.startswith('cicero.minhasfinancas.')]
    if app_classes:
        for c in app_classes[:80]:
            lines.append(f'- `{c}`')
        if len(app_classes) > 80:
            lines.append(f'- ... e mais {len(app_classes) - 80} classes')
    else:
        lines.append('- Nenhuma classe com esse prefixo encontrada.')

    with open(args.out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    print(f'Relatório salvo em: {args.out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
