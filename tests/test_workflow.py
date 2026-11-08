from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("demo", ROOT / "tools/demo.py")
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)
maps = demo.bookmaps


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cache = ROOT / ".cache/tests"
        cache.mkdir(parents=True, exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(dir=cache)
        cls.root = Path(cls.temp.name)
        cls.epub = demo.make_epub(cls.root / "示例 空格.epub")
        cls.book = maps.extract(cls.epub, cls.root / "source")
        cls.analysis = demo.demo_analysis(cls.book)

    @classmethod
    def tearDownClass(cls):
        assert cls.root.resolve().is_relative_to((ROOT / ".cache/tests").resolve())
        cls.temp.cleanup()

    def test_spine_order_and_paratext_are_preserved(self):
        sections = self.book["sections"]
        self.assertEqual([s["title"] for s in sections], ["序言", "目录", "第一章 归港", "第二章 三年前", "第三章 梦与登记簿", "第四章 门边的钥匙"])
        self.assertEqual([s["kind"] for s in sections[:2]], ["frontmatter", "navigation"])
        self.assertEqual(len(sections), 6)
        self.assertIn("section 98.xhtml", sections[2]["locator"]["epub_path"])
        self.assertEqual(self.book["conversion"]["status"], "complete")
        self.assertTrue((self.root / "source/conversion.md").read_text(encoding="utf-8").strip())

    def test_extraction_is_stable_and_preserves_original(self):
        before = self.epub.read_bytes()
        again = maps.extract(self.epub, self.root / "again", conversion=False)
        self.assertEqual(again["sections"], self.book["sections"])
        self.assertEqual(before, self.epub.read_bytes())

    def test_mixed_html_keeps_direct_text_and_nested_paragraphs_in_order(self):
        title, blocks = maps.html_blocks('<html><body><h1>章名</h1><div>前面的文字<p>段中<em>强调</em>文字</p>后面的文字<br/>下一行</div><script>隐藏脚本</script></body></html>')
        self.assertEqual(title, '章名')
        self.assertEqual(blocks, ['章名', '前面的文字', '段中强调文字', '后面的文字', '下一行'])

    def test_complete_analysis_validates(self):
        self.assertEqual(maps.validate(self.book, self.analysis), [])
        dream = next(e for e in self.analysis["events"] if e["layer"] == "dream")
        self.assertIn("不是实际毁塔", dream["summary"])

    def test_short_relationship_labels_are_optional_and_bounded(self):
        analysis = copy.deepcopy(self.analysis)
        analysis['relationships'][0].pop('short_label', None)
        self.assertEqual(maps.validate(self.book, analysis), [])
        for invalid in ['   ', '很长的关系标签不应挤满整张人物关系图']:
            analysis['relationships'][0]['short_label'] = invalid
            errors = maps.validate(self.book, analysis)
            self.assertTrue(any(e['field'] == 'relationships.0.short_label' for e in errors))

    def test_relationship_types_are_optional_unique_and_explicit(self):
        analysis = copy.deepcopy(self.analysis)
        analysis['relationships'][0].pop('relationship_types', None)
        self.assertEqual(maps.validate(self.book, analysis), [])
        analysis['relationships'][0]['relationship_types'] = ['marriage', 'family']
        self.assertEqual(maps.validate(self.book, analysis), [])
        for invalid in [[], ['marriage', 'marriage'], ['unknown'], 'family']:
            analysis['relationships'][0]['relationship_types'] = invalid
            errors = maps.validate(self.book, analysis)
            self.assertTrue(any(e['field'].startswith('relationships.0.relationship_types') for e in errors))

    def test_pending_template_is_not_a_finished_analysis(self):
        errors = maps.validate(self.book, maps.init_analysis(self.book))
        self.assertTrue(errors)
        self.assertTrue(any(e["field"] == "overview" for e in errors))

    def test_missing_coverage_and_evidence_are_rejected(self):
        analysis = copy.deepcopy(self.analysis)
        analysis["coverage"].pop()
        analysis["characters"][0]["evidence"] = []
        errors = maps.validate(self.book, analysis)
        self.assertIn("missing_section", {e["code"] for e in errors})
        self.assertIn("missing_evidence", {e["code"] for e in errors})

    def test_bad_quotes_and_locators_have_specific_errors_without_values(self):
        analysis = copy.deepcopy(self.analysis)
        secret = "sensitive-submitted-value-do-not-echo"
        analysis["characters"][0]["evidence"][0]["quote"] = secret
        analysis["events"][0]["evidence"][0]["paragraph_id"] = "s9999-p9999"
        errors = maps.validate(self.book, analysis)
        self.assertIn("quote_mismatch", {e["code"] for e in errors})
        self.assertIn("unknown_paragraph", {e["code"] for e in errors})
        self.assertNotIn(secret, json.dumps(errors))
        self.assertTrue(all(e["field"] and "；" in e["message"] for e in errors))

    def test_source_mismatch_and_unknown_characters(self):
        analysis = copy.deepcopy(self.analysis)
        analysis["source_sha256"] = "a" * 64
        analysis["relationships"][0]["from"] = "person-missing"
        errors = maps.validate(self.book, analysis)
        self.assertIn("source_mismatch", {e["code"] for e in errors})
        self.assertIn("unknown_character", {e["code"] for e in errors})

    def test_unknown_story_order_requires_explanation(self):
        analysis = copy.deepcopy(self.analysis)
        analysis["events"][0]["story_order"] = None
        errors = maps.validate(self.book, analysis)
        self.assertTrue(any(e["field"] == "events.0.uncertainty" for e in errors))
        analysis["events"][0]["uncertainty"] = "原文没有给出与其他事件的先后关系。"
        self.assertEqual(maps.validate(self.book, analysis), [])

    def test_nested_field_type_is_reported_without_crashing(self):
        analysis = copy.deepcopy(self.analysis)
        analysis["characters"][0]["aliases"] = None
        errors = maps.validate(self.book, analysis)
        self.assertTrue(any(e["field"] == "characters.0.aliases" for e in errors))

    def test_whitespace_is_not_accepted_as_evidence(self):
        analysis = copy.deepcopy(self.analysis)
        analysis['characters'][0]['evidence'][0]['quote'] = '   '
        errors = maps.validate(self.book, analysis)
        self.assertTrue(any(e['field'] == 'characters.0.evidence.0.quote' for e in errors))

    def test_existing_outputs_are_not_overwritten(self):
        with self.assertRaises(maps.InputError):
            maps.extract(self.epub, self.root / "source")

    def test_pdf_physical_pages_and_chinese_text(self):
        pdf = demo.make_pdf(self.root / "中文示例.pdf")
        book = maps.extract(pdf, self.root / "pdf-source")
        self.assertEqual(len(book["sections"]), 5)
        self.assertEqual(book["sections"][2]["locator"]["pdf_page"], 3)
        text = " ".join(p["text"] for s in book["sections"] for p in s["paragraphs"])
        self.assertIn("林岚", text)
        self.assertIn("一场梦", text)

    def test_image_only_pdf_requests_ocr(self):
        from pypdf import PdfWriter
        target = self.root / "扫描.pdf"
        writer = PdfWriter()
        writer.add_blank_page(500, 700)
        with target.open("wb") as stream:
            writer.write(stream)
        with self.assertRaises(maps.InputError) as failure:
            maps.extract(target, self.root / "scan-source")
        self.assertEqual(failure.exception.errors[0]["code"], "ocr_required")

    def test_missing_epub_spine_member_is_not_silently_skipped(self):
        target = self.root / "broken.epub"
        with ZipFile(self.epub) as source, ZipFile(target, "w", compression=ZIP_DEFLATED) as out:
            for member in source.infolist():
                if member.filename != "Book/text/section 98.xhtml":
                    out.writestr(member, source.read(member.filename))
        with self.assertRaises(maps.InputError) as failure:
            maps.extract(target, self.root / "broken-source")
        self.assertIn("缺少", failure.exception.errors[0]["message"])

    def test_cli_returns_structured_errors_and_nonzero(self):
        import sys
        result = subprocess.run([sys.executable, str(ROOT / "skills/literary-mindmaps/scripts/bookmaps.py"), "extract", "missing.epub", "--out", str(self.root / "missing")], capture_output=True, encoding="utf-8")
        self.assertEqual(result.returncode, 2)
        response = json.loads(result.stdout)
        self.assertFalse(response["ok"])
        self.assertEqual(response["errors"][0]["field"], "图书文件")


if __name__ == "__main__":
    unittest.main()
