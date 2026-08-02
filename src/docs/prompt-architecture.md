# Prompt System Architecture

> 最後更新：2026-05-07
> 原則：**Single Source of Truth（單一真實來源）**

---

## 核心原則

1. **只有 `resolvePrompt()` 可以決定最終 prompt**
2. **UI 不可自行組裝 prompt**
3. `PromptBuilderModal` 是純預覽工具，直接呼叫 `resolvePrompt()`
4. 「UI 預覽看到什麼 = Gemini 實際收到什麼」

---

## 兩種模式

### 模式 A：`dynamic`

```
DynamicPromptConfig（DB）
  ↓ 讀取：enabled_blocks、inject_prompt_text、inject_reference_answer、display_prompt
promptBuilders.js
  ↓ buildRoleLock() / buildRoleBody() / buildAnswerGuardPrompt() / buildLanguageRules() / buildPlatformRules()
resolvePrompt()
  ↓ 組裝成 fullPrompt + displayPrompt
GeminiInput（送出）
```

**規則：**
- 不讀取 SystemPrompt DB
- 不讀取 PromptBlock DB（已廢棄）
- 不使用 block_overrides（已廢棄）
- 所有 block 內容只來自 `promptBuilders.js`
- `DynamicPromptConfig` 只儲存控制欄位，不儲存 block 文字

---

### 模式 B：`db`

```
SystemPrompt（DB）
  ↓ 查詢：role + is_active = true
  ↓ task scope 優先，global fallback
  ↓ placeholder 替換：{{prompt_text}}、{{participant_id}}、{{reference_answer}}
resolvePrompt()
  ↓ fullPrompt + displayPrompt
GeminiInput（送出）
```

**規則：**
- 不使用 `promptBuilders.js`（除非 DB 無資料時 fallback）
- 不使用 `DynamicPromptConfig`
- 不使用 `PromptBlock`（已廢棄）

---

## 檔案責任

| 檔案 | 責任 | 不可做 |
|------|------|--------|
| `utils/resolvePrompt.js` | **唯一** prompt resolver | — |
| `utils/promptBuilders.js` | Block 內容函數定義 | 不可決定 prompt 來源 |
| `components/GeminiInput.jsx` | 呼叫 `resolvePrompt()`，送出給 Gemini | 不可自行組裝 prompt |
| `components/PromptBuilderModal.jsx` | 純預覽，呼叫 `resolvePrompt()` | 不可有獨立組裝邏輯 |
| `entities/SystemPrompt` | db 模式的 prompt 儲存 | — |
| `entities/DynamicPromptConfig` | dynamic 模式的控制設定 | 不可儲存 block 文字 |

---

## 已廢棄

- `entities/PromptBlock`：責任已由 `promptBuilders.js` 取代，不再使用
- `DynamicPromptConfig.block_overrides`：已移除，block 內容統一由 `promptBuilders.js` 管理
- `GeminiInput` 內的本地 `resolvePrompt()` 函數：已替換為 `utils/resolvePrompt.js`

---

## Prompt Debug

在 `PromptBuilderModal` 中，Debug 面板顯示：
- 目前模式（dynamic / db）
- prompt 真正來源（SystemPrompt id / DynamicPromptConfig id）
- 使用哪些 blocks
- inject_prompt_text 狀態
- inject_reference_answer 狀態
- 最終送出的完整 prompt
- 預估 token 數

---

## 切換模式

`TimingSettings.prompt_mode`：
- `"db"`（預設）→ 模式 B
- `"dynamic"` → 模式 A

透過 `SystemPromptManager` 或 `PromptBuilderModal` 的切換按鈕修改。