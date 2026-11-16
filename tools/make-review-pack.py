#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「第三方审议包」。

用法（在仓库根目录执行）：
    python tools/make-review-pack.py
    python tools/make-review-pack.py --out "D:/somewhere/review-pack"

产物：
    01-BRIEF.md        审议说明（自包含提示词）
    02-CONTRACT.md     契约原文节选（§0-§3、§5）
    03-SOURCE.md       全部前端源码，按路径分块
    04-MANIFEST.md     文件清单、行数、sha256、生成时间
    REVIEW-PACK-all.md 以上四份合并，便于一次性上传

设计用意：包是**生成物**，不是手写物。代码改了就重跑一次，避免「发出去的版本和仓库对不上」。
"""

import argparse
import hashlib
import io
import os
import sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

BRIEF = os.path.join(ROOT, "docs", "prompts", "09-third-party-review-brief.md")
CONTRACT = os.path.join(ROOT, "docs", "contracts", "module2-interface-v1.md")
SRC_DIR = os.path.join(ROOT, "frontend")

# 不纳入源码包的文件（作者自述，不能当事实依据；单独在 brief 第五节交代）
SKIP = {"README.md"}

# 契约切片：从头到「联调检查清单」之前，再补上「变更与沟通约定」
SLICE_START = "## 0."
SLICE_STOP = "## 4."
TAIL_START = "## 5."


def read_text(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path, text):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def slice_contract(raw):
    """按标题切出契约里前端用得到的部分，保持原文不动。"""
    start = raw.find(SLICE_START)
    stop = raw.find(SLICE_STOP)
    tail = raw.find(TAIL_START)
    if start < 0 or stop < 0:
        raise SystemExit("契约标题定位失败，检查 module2-interface-v1.md 的标题格式")
    body = raw[start:stop].rstrip()
    if tail > 0:
        body += "\n\n" + raw[tail:].strip()
    return body


def collect_source():
    """收集 frontend/ 下的全部源码，按路径排序，返回 [(相对路径, 内容)]。"""
    files = []
    for dirpath, dirnames, filenames in os.walk(SRC_DIR):
        dirnames.sort()
        for name in sorted(filenames):
            if name in SKIP:
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            files.append((rel, read_text(full)))
    files.sort(key=lambda item: item[0])
    return files


def lang_of(path):
    ext = os.path.splitext(path)[1].lstrip(".").lower()
    return {"js": "javascript", "css": "css", "html": "html", "bat": "bat", "md": "markdown"}.get(ext, "")


def build_source_md(files):
    out = [
        "# 源码（按路径分块）",
        "",
        "> 来源：仓库 `frontend/` 目录，共 {0} 个文件、{1} 行。".format(
            len(files), sum(len(c.splitlines()) for _, c in files)
        ),
        "> 说明：分块顺序为路径字典序；每块首行标注路径与行数，正文原样保留。",
        "",
    ]
    for path, content in files:
        lines = len(content.splitlines())
        out.append("## `{0}`（{1} 行）".format(path, lines))
        out.append("")
        out.append("```" + lang_of(path))
        out.append(content.rstrip("\n"))
        out.append("```")
        out.append("")
    return "\n".join(out)


def build_manifest(files, contract_lines, stamp):
    rows = ["| 文件 | 行数 | sha256(前16位) |", "|---|---|---|"]
    for path, content in files:
        rows.append("| `{0}` | {1} | `{2}` |".format(path, len(content.splitlines()), sha256(content)))
    total = sum(len(c.splitlines()) for _, c in files)
    return "\n".join(
        [
            "# 版本指纹",
            "",
            "- 生成时间：{0}（Asia/Shanghai）".format(stamp),
            "- 生成脚本：`tools/make-review-pack.py`",
            "- 源码根目录：`frontend/`",
            "- 纳入文件：{0} 个，合计 {1} 行".format(len(files), total),
            "- 未纳入：`frontend/README.md`（作者自述，不作为审议依据）",
            "- 契约节选：`docs/contracts/module2-interface-v1.md`，{0} 行".format(contract_lines),
            "",
            "## 文件清单",
            "",
        ]
        + rows
        + [
            "",
            "## 怎么用这份指纹",
            "",
            "1. 审议结论里若要指某个文件，先在这里核对行数，能快速发现「审的不是这一版」。",
            "2. 作者改完代码重跑脚本，指纹会变；两版指纹不同即说明材料已更新。",
            "3. sha256 只取前 16 位，够用于人工比对，不用于安全用途。",
            "",
        ]
    )


def main():
    parser = argparse.ArgumentParser(description="生成第三方审议包")
    parser.add_argument(
        "--out",
        default=os.path.join(os.path.expanduser("~"), "Desktop", "gdufai-review-pack"),
        help="输出目录",
    )
    args = parser.parse_args()

    if not os.path.isdir(SRC_DIR):
        raise SystemExit("找不到 frontend/ 目录，请在仓库根目录执行")

    stamp = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")
    brief = read_text(BRIEF)
    contract_raw = read_text(CONTRACT)
    contract = slice_contract(contract_raw)
    files = collect_source()

    contract_md = "\n".join(
        [
            "# 接口契约（原文节选）",
            "",
            "> 来源：`docs/contracts/module2-interface-v1.md`（{0} 行，节选 {1} 行）".format(
                len(contract_raw.splitlines()), len(contract.splitlines())
            ),
            "> 节选范围：§0 边界、§1 入站批次、§2 查询调用、§3 数据字典、§5 变更约定；§4 联调清单属交付流程，未纳入。",
            "> 效力：本节为原文照抄，**高于**任何概述与源码注释。",
            "",
            contract,
            "",
        ]
    )

    source_md = build_source_md(files)
    manifest_md = build_manifest(files, len(contract.splitlines()), stamp)

    os.makedirs(args.out, exist_ok=True)
    parts = [
        ("01-BRIEF.md", brief),
        ("02-CONTRACT.md", contract_md),
        ("03-SOURCE.md", source_md),
        ("04-MANIFEST.md", manifest_md),
    ]
    for name, text in parts:
        write_text(os.path.join(args.out, name), text)

    merged = "\n\n---\n\n".join(text.rstrip() for _, text in parts) + "\n"
    write_text(os.path.join(args.out, "REVIEW-PACK-all.md"), merged)

    total_bytes = sum(len(t.encode("utf-8")) for _, t in parts)
    print("输出目录: " + args.out)
    for name, text in parts:
        print("  {0:<18} {1:>7} 行  {2:>7.1f} KB".format(name, len(text.splitlines()), len(text.encode("utf-8")) / 1024))
    print("  {0:<18} {1:>7} 行  {2:>7.1f} KB".format("REVIEW-PACK-all.md", len(merged.splitlines()), len(merged.encode("utf-8")) / 1024))
    print("源码 {0} 个文件 / {1} 行；分册合计 {2:.1f} KB".format(len(files), sum(len(c.splitlines()) for _, c in files), total_bytes / 1024))


if __name__ == "__main__":
    sys.exit(main())
