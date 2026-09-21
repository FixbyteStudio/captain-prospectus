# Scripts

A script is the list of questions an agent asks during a visit.

## Question types
| Type | Answer value |
|---|---|
| `yes_no` | boolean |
| `single` | one of `options` |
| `multi` | array of `options` |
| `text` | string |
| `number` | number |
| `rating` | integer 1–5 |

```json
{
  "name": "default",
  "questions": [
    { "key": "has_delivery", "label": "Do you offer delivery?", "type": "yes_no", "required": true },
    { "key": "pos_system", "label": "Which POS do you use?", "type": "single", "options": ["None", "Paper", "Other app"] }
  ]
}
```

## Rules
- `key` is `snake_case`, stable, and never reused with a different meaning.
- Saving a script creates a **new version** and activates it; previous versions stay for historical answers.
- Exactly **one active script** at a time in v1.
- Agents receive the active script on every sync. A visit records the `script_id` it was answered with, even if a newer version arrived before it synced.
