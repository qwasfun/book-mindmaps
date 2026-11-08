"""Build reproducible, clearly labeled original fixtures, never a real-book claim."""
from __future__ import annotations

import html
import importlib.util
import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bookmaps", ROOT / "skills/literary-mindmaps/scripts/bookmaps.py")
bookmaps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bookmaps)


def story_sections():
    text = (ROOT / "examples/lighthouse.md").read_text(encoding="utf-8")
    sections = []
    for block in text.split("\n## ")[1:]:
        heading, _, body = block.partition("\n")
        sections.append((heading.strip(), [p.strip() for p in body.strip().split("\n\n") if p.strip()]))
    return sections


def make_epub(target):
    sections = story_sections()
    sections.insert(1, ("目录", [title for title, _ in sections[1:]]))
    entries = []
    with ZipFile(target, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        archive.writestr("META-INF/container.xml", '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="Book/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        for index, (heading, blocks) in enumerate(sections):
            filename = f"text/section {100-index}.xhtml"
            properties = ' properties="nav"' if heading == "目录" else ""
            entries.append(f'<item id="part{index}" href="{filename.replace(" ", "%20")}" media-type="application/xhtml+xml"{properties}/>')
            markup = f'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>{html.escape(heading)}</title></head><body><h1>{html.escape(heading)}</h1>' + ''.join(f'<p>{html.escape(p)}</p>' for p in blocks) + '</body></html>'
            archive.writestr(f"Book/{filename}", markup)
        # Reverse manifest order and descending filenames to catch filename-based reading order.
        opf = '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">bookmaps-original-demo-v1</dc:identifier><dc:title>灯塔来信（原创验收示例）</dc:title><dc:creator>项目原创示例</dc:creator><dc:language>zh-CN</dc:language></metadata><manifest>' + ''.join(reversed(entries)) + '</manifest><spine>' + ''.join(f'<itemref idref="part{i}"/>' for i in range(len(sections))) + '</spine></package>'
        archive.writestr("Book/package.opf", opf)
    return target


def make_pdf(target):
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfgen import canvas

    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    pdf = canvas.Canvas(str(target))
    pdf.setTitle("灯塔来信（原创验收示例）")
    pdf.setAuthor("项目原创示例")
    for title, blocks in story_sections():
        pdf.setFont("STSong-Light", 17)
        pdf.drawString(50, 790, title)
        pdf.setFont("STSong-Light", 12)
        y = 750
        for block in blocks:
            for start in range(0, len(block), 35):
                pdf.drawString(50, y, block[start:start+35])
                y -= 23
            y -= 12
        pdf.showPage()
    pdf.save()
    return target


def demo_analysis(book):
    def evidence(quote):
        for section in book["sections"]:
            if section["kind"] != "content":
                continue
            for paragraph in section["paragraphs"]:
                if quote in paragraph["text"]:
                    return {"paragraph_id": paragraph["id"], "quote": quote}
        raise ValueError(f"示例证据未找到：{quote}")

    returned = "林岚回到雾港时，沈舟把一封没有落款的信交给她。"
    alias = "沈舟仍叫她阿岚，那是林岚小时候的名字。"
    entrusted = "三年前，林岚把灯塔的铜钥匙交给沈舟，约定春天一起修好失灵的灯。"
    dream = "醒来时，塔仍立在岸边，她明白那只是一场梦。"
    confession = "沈舟承认：信是我写的，想请你回来把灯修好。"
    keeper = "清晨，程伯拿出邮局登记簿，记录显示寄信人是沈舟。"
    keeper_role = "守塔人程伯说，信是三天前从旧邮局送来的；他没有看见寄信人。"
    repaired = "林岚与沈舟一起换好了灯泡。"
    ending = "林岚把铜钥匙挂回门边，没有答应留下，也没有说要走。"
    def item(id, quotes, classification="fact", layer="story", **fields):
        return {"id": id, "classification": classification, "layer": layer,
                "evidence": [evidence(quote) for quote in quotes], **fields}
    analysis = bookmaps.init_analysis(book)
    analysis["coverage"] = [{"section_id": s["id"], "status": "read" if s["kind"] == "content" else "excluded", "reason": "" if s["kind"] == "content" else "原文已核对，为示例说明或目录，不属于故事正文。"} for s in book["sections"]]
    analysis["characters"] = [
        item("person-lin", [returned, alias, repaired, ending], name="林岚", aliases=["阿岚"], description="离开雾港后归来，与沈舟共同修灯；是否留下并未确定。"),
        item("person-shen", [returned, confession], name="沈舟", aliases=[], description="写匿名信邀林岚归港，随后承认自己的用意。"),
        item("person-cheng", [keeper_role, keeper], name="程伯", aliases=["守塔人"], description="拿出登记簿、帮助说明信件来历的守塔人。"),
    ]
    analysis["relationships"] = [
        item("relation-key", [entrusted, repaired], **{"from": "person-lin", "to": "person-shen"}, short_label="托付与合作", label="曾托付钥匙，重逢后一起修灯"),
        item("relation-letter", [confession], **{"from": "person-shen", "to": "person-lin"}, short_label="邀约归来", label="写信邀请归港"),
        item("relation-register", [keeper], **{"from": "person-cheng", "to": "person-lin"}, short_label="澄清来信", label="出示登记簿，澄清来信"),
    ]
    analysis["events"] = [
        item("event-return", [returned], title="归港与匿名来信", summary="林岚回到雾港，收到沈舟递来的无落款信。", story_order=2, narrative_order=1, uncertainty=""),
        item("event-past", [entrusted], layer="memory", title="三年前托付钥匙", summary="叙述回到三年前：林岚交出钥匙，与沈舟约好修灯。", story_order=1, narrative_order=2, uncertainty=""),
        item("event-dream", [dream], layer="dream", title="灯塔入海的梦", summary="林岚梦见程伯把塔推入海里；醒后塔仍在，这不是实际毁塔。", story_order=3, narrative_order=3, uncertainty=""),
        item("event-truth", [keeper, confession], title="登记簿与坦白", summary="登记簿与沈舟的承认说明匿名信的来历。", story_order=4, narrative_order=4, uncertainty=""),
        item("event-light", [repaired, ending], title="修灯，留下开放的选择", summary="两人修好灯，林岚把钥匙挂回门边；去留仍未明确。", story_order=5, narrative_order=5, uncertainty=""),
    ]
    analysis["themes"] = [
        item("theme-light", [repaired], classification="interpretation", title="灯光与关系修复", description="共同修灯可读作重新合作的象征，但不能据此断言两人所有误会都已消除。", alternative_readings=["也可以只把它理解为一次共同完成的具体修理。"]),
        item("theme-key", [entrusted, ending], classification="interpretation", title="钥匙与选择", description="钥匙从托付到挂回门边，可联想到信任和选择权的变化。", alternative_readings=["钥匙也可能只是贯穿情节的实用物件。"]),
        item("theme-ending", [ending], classification="uncertain", title="未决定的去留", description="结尾保留林岚是否留下的空间；文本没有明确给出答案。", alternative_readings=["归还钥匙可以被读为告别，也可能是在保留下一次归来的可能。"]),
    ]
    def leaf(id, label, quote, classification="fact", layer="story"):
        return item(id, [quote], classification, layer, label=label, children=[])
    def branch(id, label, children):
        return item(id, [], label=label, children=children)
    analysis["overview"] = [
        branch("map-plot", "情节主线", [leaf("map-return", "归港：收到匿名信", returned), leaf("map-truth", "揭示：沈舟承认来信", confession), leaf("map-repair", "收束：共同修灯", repaired)]),
        branch("map-people", "人物与关系", [leaf("map-lin", "林岚 / 阿岚", alias), leaf("map-shen", "沈舟：写信邀请归港", confession), leaf("map-cheng", "程伯：登记簿提供线索", keeper)]),
        branch("map-time", "叙述与发生顺序", [leaf("map-memory", "三年前的托付后被讲述", entrusted, layer="memory"), leaf("map-now", "先写归港，再回望过去", returned)]),
        branch("map-images", "主题与意象", [leaf("map-light", "灯光：合作与修复的一种读法", repaired, "interpretation"), leaf("map-key", "钥匙：去留尚未决定", ending, "uncertain")]),
        branch("map-layers", "叙事层次", [leaf("map-dream", "梦境不是实际毁塔", dream, layer="dream"), leaf("map-open", "开放结尾保留多种可能", ending, "interpretation")]),
    ]
    return analysis


def main():
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "output/demo"
    destination.mkdir(parents=True, exist_ok=True)
    epub = make_epub(destination / "lighthouse.epub")
    make_pdf(destination / "lighthouse.pdf")
    book = bookmaps.extract(epub, destination / "source", force=True)
    bookmaps.write_json(destination / "analysis.json", demo_analysis(book))
    print(json.dumps({"ok": True, "demo": "原创短篇验收示例", "out": str(destination)}, ensure_ascii=False))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
