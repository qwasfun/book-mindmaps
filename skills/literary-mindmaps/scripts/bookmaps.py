"""Prepare actual EPUB/PDF text and validate source-grounded literary analysis.

This module never calls a model. Codex reads the extracted chapters and authors
the analysis; deterministic validation checks locators, quotes and coverage.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import posixpath
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import BadZipFile, ZipFile


class InputError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("输入需要修正")


def error(field, reason, fix, code="invalid"):
    return {"field": field, "code": code, "message": f"{field}：{reason}；{fix}"}


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        raise InputError([error("输入文件", "无法读取有效 JSON", "请检查文件是否存在并保存为 UTF-8 JSON")]) from None


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def archive_path(base, href):
    parts = urlsplit(href)
    if parts.scheme or parts.netloc:
        raise InputError([error("EPUB 资源路径", "正文引用了外部资源", "请提供正文完整的本地 EPUB")])
    resolved = posixpath.normpath(posixpath.join(base, unquote(parts.path)))
    if resolved.startswith(("../", "/")) or resolved == ".." or "\\" in resolved:
        raise InputError([error("EPUB 资源路径", "路径超出电子书目录", "请检查 EPUB 的资源清单")])
    return resolved


def get_archive(archive, name):
    try:
        info = archive.getinfo(name)
        if info.file_size > 100 * 1024 * 1024:
            raise InputError([error("EPUB 正文资源", "单个资源超过 100 MB", "请拆分电子书后重试")])
        return archive.read(name)
    except KeyError:
        raise InputError([error("EPUB 资源清单", "缺少被引用的正文文件", "请修复 EPUB 后重新解析")]) from None


def local_tag(element):
    return element.tag.rsplit("}", 1)[-1]


def html_blocks(raw):
    from bs4 import BeautifulSoup, Comment, NavigableString

    soup = BeautifulSoup(raw, "html.parser")
    for tag in list(soup.find_all(["script", "style", "head", "svg"])):
        tag.decompose()
    for tag in list(soup.find_all(attrs={"hidden": True})):
        tag.decompose()
    for tag in list(soup.find_all(attrs={"aria-hidden": "true"})):
        tag.decompose()
    for tag in list(soup.find_all(style=re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden", re.I))):
        tag.decompose()
    heading = soup.find(re.compile(r"^h[1-6]$"))
    title = normalize(heading.get_text(" ", strip=True)) if heading else ""
    blocks, pending = [], []
    block_tags = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "pre", "td", "div", "section", "article", "br", "tr", "dt", "dd", "figcaption", "header", "footer", "nav"}

    def flush():
        text = normalize("".join(pending))
        if text:
            blocks.append(text)
        pending.clear()

    def walk(node):
        if isinstance(node, Comment):
            return
        if isinstance(node, NavigableString):
            pending.append(str(node))
            return
        boundary = node.name in block_tags
        if boundary:
            flush()
        for child in node.children:
            walk(child)
        if boundary:
            flush()

    walk(soup.body or soup)
    flush()
    return title, blocks


def section_kind(title, properties="", path="", semantic=""):
    if "nav" in properties.split() or semantic == "toc" or re.fullmatch(r"目录|目錄|contents|table of contents", title, re.I):
        return "navigation"
    if re.search(r"^(封面|扉页|版[权權]|序言|前言|译者序|譯者序|献词|獻詞|cover|copyright|preface|foreword)", title, re.I):
        return "frontmatter"
    if re.search(r"^(附录|附錄|后记|後記|跋|致谢|致謝|appendix|afterword|acknowledg)", title, re.I):
        return "backmatter"
    if re.search(r"(^|/)(cover|titlepage|copyright)\.", path, re.I):
        return "frontmatter"
    return "content"


def extract_epub(path):
    from defusedxml import ElementTree as ET

    sections, warnings = [], []
    with ZipFile(path) as archive:
        if sum(info.file_size for info in archive.infolist()) > 500 * 1024 * 1024:
            raise InputError([error("EPUB 文件", "解压后超过 500 MB", "请拆分电子书后重试")])
        container = ET.fromstring(get_archive(archive, "META-INF/container.xml"))
        rootfiles = [el for el in container.iter() if local_tag(el) == "rootfile"]
        if not rootfiles or not rootfiles[0].get("full-path"):
            raise InputError([error("EPUB 目录", "找不到 OPF 根文件", "请提供结构完整的 EPUB")])
        opf_path = archive_path("", rootfiles[0].get("full-path"))
        opf = ET.fromstring(get_archive(archive, opf_path))
        title = next((normalize(el.text or "") for el in opf.iter() if local_tag(el) == "title"), path.stem)
        author = next((normalize(el.text or "") for el in opf.iter() if local_tag(el) == "creator"), "")
        manifest = {el.get("id"): el for el in opf.iter() if local_tag(el) == "item"}
        spine = [el for el in opf.iter() if local_tag(el) == "itemref"]
        if not spine:
            raise InputError([error("EPUB 阅读顺序", "spine 为空", "请修复电子书的阅读顺序清单")])
        for index, itemref in enumerate(spine, 1):
            item = manifest.get(itemref.get("idref"))
            if item is None or not item.get("href"):
                raise InputError([error(f"EPUB spine[{index}]", "未对应到正文资源", "请修复 manifest 与 spine 的引用")])
            resource = archive_path(posixpath.dirname(opf_path), item.get("href"))
            media_type = item.get("media-type", "")
            if media_type not in ("application/xhtml+xml", "text/html"):
                warnings.append(f"spine 第 {index} 项为非文字资源，需检查原书图像内容。")
                heading, blocks = "", []
            else:
                heading, blocks = html_blocks(get_archive(archive, resource))
            heading = heading or Path(resource).stem
            sid = f"s{index:04d}"
            paragraphs = [{"id": f"{sid}-p{number:04d}", "text": text,
                           "locator": {"epub_path": resource, "paragraph": number}}
                          for number, text in enumerate(blocks, 1)]
            sections.append({"id": sid, "title": heading,
                             "kind": section_kind(heading, item.get("properties", ""), resource),
                             "locator": {"epub_path": resource, "spine_index": index},
                             "paragraphs": paragraphs})
            if not paragraphs:
                warnings.append(f"{sid} 无可提取正文，可能是图片、加密资源或空页；请检查原书。")
        warnings.append("章节类别由标题初步识别，请核对前言、目录、附录与正文；全部 spine 项均保留。")
    return title, author, sections, warnings


def extract_pdf(path):
    from pypdf import PdfReader

    reader = PdfReader(path)
    if reader.is_encrypted and not reader.decrypt(""):
        raise InputError([error("PDF 文件", "需要密码才能读取", "请提供可读取的副本；不要在分析文件中保存密码")])
    sections, warnings = [], []
    for number, page in enumerate(reader.pages, 1):
        sid = f"s{number:04d}"
        text = page.extract_text() or ""
        # PDF layout wraps often split Chinese words across physical lines.
        # Join only single CJK line breaks; retain blank paragraph boundaries.
        text = re.sub(r"(?<=[\u3400-\u9fff，。！？；：、]) *\n *(?=[\u3400-\u9fff])", "", text)
        blocks = [normalize(block) for block in re.split(r"\n\s*\n", text) if normalize(block)]
        paragraphs = [{"id": f"{sid}-p{index:04d}", "text": text,
                       "locator": {"pdf_page": number, "paragraph": index}}
                      for index, text in enumerate(blocks, 1)]
        sections.append({"id": sid, "title": f"文件第 {number} 页", "kind": "content",
                         "locator": {"pdf_page": number}, "paragraphs": paragraphs})
        if not text.strip():
            warnings.append(f"文件第 {number} 页无可提取文字；请检查空白页、扫描页或缺失字体映射，必要时先 OCR。")
    metadata = reader.metadata or {}
    title = str(metadata.get("/Title") or path.stem)
    author = str(metadata.get("/Author") or "")
    warnings.append("PDF 按物理页完整提取；分析时请依据目录和页内标题分章。文件页码不等同于印刷页码。")
    return title, author, sections, warnings


def extract(path, out, force=False, conversion=True):
    path, out = Path(path).resolve(), Path(out).resolve()
    if not path.is_file():
        raise InputError([error("图书文件", "文件不存在", "请提供可读取的本地 PDF 或 EPUB 文件")])
    suffix = path.suffix.lower()
    if suffix not in (".epub", ".pdf"):
        raise InputError([error("图书格式", "仅支持 PDF 和 EPUB", "请先转换为 .pdf 或 .epub")])
    if out.exists() and any(out.iterdir()) and not force:
        raise InputError([error("输出目录", "目录非空", "请选择新目录，或确认替换生成文件后使用 --force")])
    try:
        title, author, sections, warnings = extract_epub(path) if suffix == ".epub" else extract_pdf(path)
    except InputError:
        raise
    except Exception as exc:
        # Never echo submitted document data or a traceback into field errors.
        raise InputError([error("图书文件", "解析失败或文件结构损坏", "请检查文件是否完整且可正常阅读", type(exc).__name__)]) from None
    if not any(section["paragraphs"] for section in sections):
        raise InputError([error("图书正文", "未提取到任何文字", "请先进行 OCR，或提供含文字层且未加密的电子书", "ocr_required")])
    book = {"schema_version": 1, "title": title, "author": author,
            "source": {"filename": path.name, "format": suffix[1:],
                       "sha256": hashlib.sha256(path.read_bytes()).hexdigest()},
            "sections": sections, "warnings": warnings}
    out.mkdir(parents=True, exist_ok=True)
    if conversion:
        from markitdown import MarkItDown, StreamInfo

        try:
            result = MarkItDown(enable_plugins=False).convert_stream(
                io.BytesIO(path.read_bytes()), stream_info=StreamInfo(extension=suffix))
            markdown = getattr(result, "markdown", None) or result.text_content
            (out / "conversion.md").write_text(markdown, encoding="utf-8")
            book["conversion"] = {"tool": "markitdown", "status": "complete", "file": "conversion.md"}
        except Exception as exc:
            book["conversion"] = {"tool": "markitdown", "status": "failed", "reason": type(exc).__name__}
            warnings.append("MarkItDown 辅助转换未完成；逐段原文仍已提取，请检查版面和章节覆盖。")
    for section in sections:
        chapter_path = out / "chapters" / f"{section['id']}.md"
        chapter_path.parent.mkdir(parents=True, exist_ok=True)
        lines = [f"# {section['title']}", "", f"类别：{section['kind']}（需核对）", ""]
        for paragraph in section["paragraphs"]:
            lines.extend([f"<!-- {paragraph['id']} -->", paragraph["text"], ""])
        chapter_path.write_text("\n".join(lines), encoding="utf-8")
        section["file"] = f"chapters/{section['id']}.md"
    write_json(out / "book.json", book)
    return book


def init_analysis(book):
    return {"schema_version": 1, "source_sha256": book["source"]["sha256"], "title": book["title"],
            "language": "zh-CN", "scope": "full-book", "spoilers": True,
            "coverage": [{"section_id": s["id"], "status": "pending", "reason": ""} for s in book["sections"]],
            "characters": [], "relationships": [], "events": [], "themes": [], "overview": []}


def schema_errors(analysis):
    from jsonschema import Draft202012Validator

    schema = read_json(Path(__file__).resolve().parents[1] / "references" / "analysis.schema.json")
    errors = []
    for failure in Draft202012Validator(schema).iter_errors(analysis):
        path = ".".join(str(part) for part in failure.absolute_path) or "analysis"
        rule = failure.validator
        if rule == "required":
            missing = [key for key in failure.validator_value if key not in failure.instance]
            errors.extend(error(f"{path}.{key}", "不能为空", "请补充该字段", "required") for key in missing)
            continue
        reason, fix = {
            "type": ("字段类型不正确", "请使用格式说明指定的字段类型"),
            "enum": ("选项不在支持范围内", "请使用格式说明列出的选项"),
            "const": ("与本工作流的固定设置不一致", "请按格式说明设置该字段"),
            "minLength": ("不能为空", "请填写有意义的内容"),
            "maxLength": (f"最多填写 {failure.validator_value} 个字符", "请缩短该字段"),
            "minItems": (f"至少填写 {failure.validator_value} 项", "请补充所需条目"),
            "minimum": (f"不得小于 {failure.validator_value}", "请修正顺序编号"),
            "additionalProperties": ("包含未定义的字段", "请对照格式说明修正字段名称"),
            "pattern": ("格式不正确", "请使用字母、数字与短横线组成的 ID，或指定的 SHA-256 格式"),
        }.get(rule, ("不符合分析格式", "请对照格式说明修正"))
        if rule == "pattern" and failure.validator_value == r"\S":
            reason, fix = "不能为空或只包含空白", "请填写有意义的文字内容"
        errors.append(error(path, reason, fix, f"schema_{rule}"))
    return errors


def validate(book, analysis):
    errors = schema_errors(analysis)
    if errors:
        return errors
    if analysis["source_sha256"] != book["source"]["sha256"]:
        errors.append(error("source_sha256", "分析与原书版本不匹配", "请用当前 book.json 重新初始化分析并核对出处", "source_mismatch"))
    sections = {section["id"]: section for section in book["sections"]}
    paragraphs = {p["id"]: (p, section) for section in book["sections"] for p in section["paragraphs"]}
    coverage = {}
    for index, entry in enumerate(analysis["coverage"]):
        field = f"coverage.{index}"
        sid = entry["section_id"]
        if sid in coverage:
            errors.append(error(f"{field}.section_id", "章节重复", "每个章节只保留一个覆盖记录"))
        coverage[sid] = entry
        if sid not in sections:
            errors.append(error(f"{field}.section_id", "章节不存在", "请使用 book.json 中的章节 ID"))
            continue
        if entry["status"] == "pending":
            errors.append(error(f"{field}.status", "章节尚未读完", "完整阅读该节后标记 read；非正文可说明原因后标记 excluded", "unread_section"))
        if entry["status"] == "excluded":
            if not entry["reason"].strip():
                errors.append(error(f"{field}.reason", "排除原因不能为空", "请说明为何该节不属于正文"))
            if sections[sid]["kind"] == "content":
                errors.append(error(f"{field}.status", "全书分析不能排除正文", "请完整阅读该节；如分类有误先核对 book.json 的章节类别"))
        if entry["status"] == "read" and not sections[sid]["paragraphs"]:
            errors.append(error(f"{field}.status", "该节没有可读取的文字", "请检查原书并先完成 OCR，不能直接标记已读", "ocr_required"))
    for sid in sections:
        if sid not in coverage:
            errors.append(error("coverage", "缺少章节覆盖记录", f"请补充 {sid} 的阅读状态", "missing_section"))

    ids = set()
    character_ids = {item["id"] for item in analysis["characters"]}
    references = 0

    def check_item(item, field, evidence_required=True):
        nonlocal references
        if item["id"] in ids:
            errors.append(error(f"{field}.id", "ID 重复", "请为每个分析条目设置唯一 ID"))
        ids.add(item["id"])
        if evidence_required and not item["evidence"]:
            errors.append(error(f"{field}.evidence", "缺少原文证据", "请添加实际段落 ID 和短引文", "missing_evidence"))
        for index, reference in enumerate(item["evidence"]):
            base = f"{field}.evidence.{index}"
            found = paragraphs.get(reference["paragraph_id"])
            if not found:
                errors.append(error(f"{base}.paragraph_id", "段落不存在", "请从 book.json 复制实际段落 ID", "unknown_paragraph"))
                continue
            paragraph, section = found
            if not normalize(reference["quote"]) or normalize(reference["quote"]) not in normalize(paragraph["text"]):
                errors.append(error(f"{base}.quote", "引文不在所指段落中", "请逐字核对原文短引文与段落 ID", "quote_mismatch"))
            if coverage.get(section["id"], {}).get("status") != "read":
                errors.append(error(base, "引用了未读或已排除章节", "请完成原文阅读并修正 coverage"))
            references += 1

    for group in ("characters", "relationships", "events", "themes"):
        for index, item in enumerate(analysis[group]):
            field = f"{group}.{index}"
            check_item(item, field)
            if group == "relationships":
                for end in ("from", "to"):
                    if item[end] not in character_ids:
                        errors.append(error(f"{field}.{end}", "人物 ID 不存在", "请先建立人物条目，再引用该人物", "unknown_character"))
            if group == "events" and item["story_order"] is None and not item["uncertainty"].strip():
                errors.append(error(f"{field}.uncertainty", "发生顺序未知时必须说明原因", "请说明线索不足或存在其他可能顺序"))

    def visit(nodes, field):
        for index, item in enumerate(nodes):
            base = f"{field}.{index}"
            check_item(item, base, not item["children"])
            visit(item["children"], f"{base}.children")

    visit(analysis["overview"], "overview")
    if not references:
        errors.append(error("原文证据", "没有任何可核验引用", "请为主要结论补充段落 ID 与短引文"))
    return errors


class StructuredParser(argparse.ArgumentParser):
    def error(self, message):
        raise InputError([error("命令参数", "缺少必须参数或选项无效", "请使用 --help 查看该命令的必填参数和支持选项")])


def main(argv=None):
    parser = StructuredParser(description="电子书原文解析、分析初始化与出处核验；不调用模型或发布内容")
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("extract", help="完整提取本地 EPUB/PDF")
    prepare.add_argument("source")
    prepare.add_argument("--out", required=True)
    prepare.add_argument("--force", action="store_true")
    prepare.add_argument("--skip-conversion", action="store_true", help="跳过 MarkItDown 辅助转换，仍保留逐段定位")
    initialize = sub.add_parser("init", help="创建待人工/模型填写的分析文件")
    initialize.add_argument("book")
    initialize.add_argument("--out", required=True)
    initialize.add_argument("--force", action="store_true")
    verify = sub.add_parser("validate", help="验证分析格式、章节覆盖、出处与引文")
    verify.add_argument("book")
    verify.add_argument("analysis")
    try:
        args = parser.parse_args(argv)
        if args.command == "extract":
            book = extract(args.source, args.out, args.force, not args.skip_conversion)
            result = {"ok": True, "book": str(Path(args.out) / "book.json"), "sections": len(book["sections"]), "warnings": book["warnings"]}
        elif args.command == "init":
            if Path(args.out).exists() and not args.force:
                raise InputError([error("分析文件", "文件已存在", "请选择新路径，或确认替换后使用 --force")])
            write_json(args.out, init_analysis(read_json(args.book)))
            result = {"ok": True, "analysis": str(Path(args.out)), "status": "pending", "message": "模板已创建；请完整阅读原文并填写分析，尚未通过核验。"}
        else:
            errors = validate(read_json(args.book), read_json(args.analysis))
            if errors:
                raise InputError(errors)
            result = {"ok": True, "checks": ["字段格式", "原书版本", "章节覆盖", "段落出处", "短引文匹配", "人物引用"],
                      "limitation": "工具不能判断语义支持、文学解释质量或是否实际完成阅读；需结合原文复核。"}
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except InputError as exc:
        print(json.dumps({"ok": False, "errors": exc.errors}, ensure_ascii=False))
        return 2
    except (OSError, KeyError, TypeError, ValueError):
        print(json.dumps({"ok": False, "errors": [error("输入或输出文件", "文件不可读、不可写或原文索引损坏", "请检查路径权限并重新提取 book.json")]}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
