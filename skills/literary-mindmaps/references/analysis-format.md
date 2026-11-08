# 分析数据与证据

完整机器格式在 [analysis.schema.json](analysis.schema.json)。先用 `init` 生成 JSON，再由 Codex 读原文填写，不用程序凭关键词自动编造文学分析。

## 共同字段

人物、关系、事件、主题和导图节点都包含：

- `id`：全文件唯一，字母开头，仅字母、数字、短横线。
- `classification`：`fact` / `interpretation` / `uncertain`。
- `layer`：`story` / `dream` / `memory` / `rumor` / `hypothesis` / `narrator`。
- `evidence`：`[{"paragraph_id":"s0002-p0003","quote":"确实出现在该段中的短引文"}]`，每条最多 240 字符。重要结论至少一条，可给多条。只有非叶子的导图分组可以没有证据。

引文只用于短证据，不用长篇摘录代替归纳。PDF 段落可能涵盖整页，要继续检查具体句子。

## 四类内容

| 数组 | 其他字段 |
| --- | --- |
| `characters` | `name`、`aliases`（字符串数组）、`description` |
| `relationships` | `from`、`to`（人物 ID）、`label`（关系及变化，可多条）、可选 `short_label`（最多 12 字符的图上关系标签） |
| `events` | `title`、`summary`、`story_order`（正整数或 null）、`narrative_order`（正整数）、`uncertainty`（未知发生顺序时必填） |
| `themes` | `title`、`description`、`alternative_readings`（字符串数组） |
| `overview` | `label`、`children`（递归节点数组；叶子填空数组） |

事件的两个 order 是排序索引，不是书中的实际年份。并行发生可用相同索引；无法确定发生顺序的事件显示在“顺序未定”组，不强行排入时间线。梦境和传闻在两种时间线都明确标注其层次。

`short_label` 由阅读者依据同条关系的原文证据填写，例如“夫妻”“父子”“主仆”“结义兄弟”。用“诬称私情”“单向示意”等明确区分未成立的关系，不用关键词自动猜测身份。它概括两人之间的关系，方向、阶段变化和限定仍保留在完整 `label`、`classification` 与 `layer` 中。同一对人物的不同标签可并列展示；没有填写时，界面仅截取原有说明，不生成新的文学判断。

示例人物（ID 与引文必须替换为真实提取值）：

```json
{
  "id": "person-lin",
  "name": "林岚",
  "aliases": ["阿岚"],
  "description": "离开雾港后归来的修灯人。",
  "classification": "fact",
  "layer": "story",
  "evidence": [{"paragraph_id": "s0002-p0003", "quote": "沈舟仍叫她阿岚，那是林岚小时候的名字。"}]
}
```

## 完整性

`source_sha256` 必须匹配原书文件指纹。`coverage` 为 book.json 的每节各填一条 `section_id`、`status` 和 `reason`。初始化为 `pending`，读完填 `read`；核对属于非正文的节可填 `excluded` 并解释原因。全书分析不能直接排除正文，原文分类错误需先核对后修正。

核验器能发现缺章、缺证据、错误引用、引文不匹配和人物 ID 错误，但不能证明人物身份、关系、主题推论正确，也不能验证“已读”声明。对主要结论仍须回到原文检查。
