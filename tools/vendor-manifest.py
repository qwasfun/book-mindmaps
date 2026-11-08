"""Record installed third-party content and preserve its upstream licenses."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ("markitdown", "K-Dense-AI/scientific-agent-skills", "skills/markitdown"),
    ("mindmap", "galiacheng/mindmap-skills", "skills/mindmap"),
]
records = []
previous_path = ROOT / 'skills/third-party.json'
previous = json.loads(previous_path.read_text(encoding='utf-8')) if previous_path.exists() else {'skills': []}
for name, repo, resource in SOURCES:
    directory = ROOT / ".agents/skills" / name
    license_path = directory / "UPSTREAM-LICENSE"
    license_url = next((entry['license_source'] for entry in previous['skills'] if entry['skill'] == name), f"https://raw.githubusercontent.com/{repo}/main/LICENSE")
    if not license_path.exists():
        for filename in ("LICENSE", "LICENSE.md", "LICENSE.txt"):
            license_url = f"https://raw.githubusercontent.com/{repo}/main/{filename}"
            request = Request(license_url, headers={"User-Agent": "book-mindmaps-local-setup"})
            try:
                with urlopen(request, timeout=20) as response:
                    license_path.write_bytes(response.read())
                break
            except HTTPError as failure:
                if failure.code != 404:
                    raise
        else:
            raise RuntimeError(f"未找到 {repo} 的上游许可证")
    files = {
        file.relative_to(directory).as_posix(): hashlib.sha256(file.read_bytes()).hexdigest()
        for file in sorted(directory.rglob("*"))
        if file.is_file() and "__pycache__" not in file.parts
    }
    records.append({"skill": name, "repository": f"https://github.com/{repo}", "path": resource,
                    "installed_ref": "main", "license_source": license_url,
                    "note": "Installed content is pinned by the recorded SHA-256 hashes; main is not an immutable commit.",
                    "files": files})
destination = ROOT / "skills/third-party.json"
destination.write_text(json.dumps({"recorded_at": datetime.now(timezone.utc).isoformat(), "skills": records}, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"ok": True, "skills": [{"name": s["skill"], "files": len(s["files"])} for s in records]}))
