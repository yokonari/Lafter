"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import styles from "../../adminTheme.module.scss";

export type ArtistAlias = {
  name: string;
  kana: string;
};

type AliasSelectorProps = {
  selectedAliases: ArtistAlias[];
  onChange: (aliases: ArtistAlias[]) => void;
};

const MAX_ALIASES = 10;
const MAX_NAME_LENGTH = 100;
const MAX_KANA_LENGTH = 100;

export function AliasSelector({ selectedAliases, onChange }: AliasSelectorProps) {
  const [newAliasName, setNewAliasName] = useState("");
  const [newAliasKana, setNewAliasKana] = useState("");

  const handleAddAlias = () => {
    // バリデーション
    if (!newAliasName.trim()) {
      toast.error("別名を入力してください。");
      return;
    }

    if (newAliasName.length > MAX_NAME_LENGTH) {
      toast.error(`別名は${MAX_NAME_LENGTH}文字以内で入力してください。`);
      return;
    }

    if (newAliasKana.length > MAX_KANA_LENGTH) {
      toast.error(`読み仮名は${MAX_KANA_LENGTH}文字以内で入力してください。`);
      return;
    }

    // 重複チェック
    if (selectedAliases.some((a) => a.name === newAliasName.trim())) {
      toast.error("同じ別名が既に登録されています。");
      return;
    }

    // 最大件数チェック
    if (selectedAliases.length >= MAX_ALIASES) {
      toast.error(`別名は最大${MAX_ALIASES}件まで登録できます。`);
      return;
    }

    // 追加
    onChange([
      ...selectedAliases,
      {
        name: newAliasName.trim(),
        kana: newAliasKana.trim(),
      },
    ]);

    // 入力欄をクリア
    setNewAliasName("");
    setNewAliasKana("");
  };

  const handleRemoveAlias = (name: string) => {
    onChange(selectedAliases.filter((a) => a.name !== name));
  };

  const handleNameChange = (oldName: string, newName: string) => {
    onChange(
      selectedAliases.map((a) =>
        a.name === oldName ? { ...a, name: newName } : a
      )
    );
  };

  const handleKanaChange = (name: string, newKana: string) => {
    onChange(
      selectedAliases.map((a) =>
        a.name === name ? { ...a, kana: newKana } : a
      )
    );
  };

  return (
    <div className={styles.formGroup}>
      <label className={styles.label}>
        別名（オプション）
      </label>

      {/* 新規別名の入力フォーム */}
      <div className={styles.aliasInputRow}>
        <div className={styles.aliasInputGroup}>
          <input
            type="text"
            value={newAliasName}
            onChange={(e) => setNewAliasName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddAlias();
              }
            }}
            placeholder="別名"
            className={styles.input}
            maxLength={MAX_NAME_LENGTH}
          />
          <input
            type="text"
            value={newAliasKana}
            onChange={(e) => setNewAliasKana(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddAlias();
              }
            }}
            placeholder="読み仮名"
            className={styles.input}
            maxLength={MAX_KANA_LENGTH}
          />
        </div>
        <button
          type="button"
          onClick={handleAddAlias}
          className={styles.secondaryButton}
        >
          追加
        </button>
      </div>

      {/* 登録済み別名一覧 */}
      {selectedAliases.length > 0 && (
        <div className={styles.selectedAliases}>
          <p className={styles.subLabel}>
            登録済み別名（{selectedAliases.length}/{MAX_ALIASES}件）
          </p>
          {selectedAliases.map((alias, index) => (
            <div key={`${alias.name}-${index}`} className={styles.selectedAliasItem}>
              <div className={styles.aliasInputGroup}>
                <input
                  type="text"
                  value={alias.name}
                  onChange={(e) => handleNameChange(alias.name, e.target.value)}
                  className={styles.smallInput}
                  placeholder="別名"
                  maxLength={MAX_NAME_LENGTH}
                />
                <input
                  type="text"
                  value={alias.kana}
                  onChange={(e) => handleKanaChange(alias.name, e.target.value)}
                  className={styles.smallInput}
                  placeholder="読み仮名"
                  maxLength={MAX_KANA_LENGTH}
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveAlias(alias.name)}
                className={styles.iconButton}
                aria-label="削除"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
