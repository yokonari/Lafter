"use client";

import { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";
import styles from "../../adminTheme.module.scss";

type Style = {
  id: string;
  name: string;
  color: string | null;
  displayOrder: number;
};

type StyleDialogProps = {
  onClose: () => void;
};

export function StyleDialog({ onClose }: StyleDialogProps) {
  const [styleList, setStyleList] = useState<Style[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 追加フォーム
  const [isAddMode, setIsAddMode] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("");

  // 編集フォーム
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const fetchStyles = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/styles");
      if (!response.ok) {
        throw new Error("芸風一覧の取得に失敗しました。");
      }
      const data = (await response.json()) as { styles: Style[] };
      setStyleList(data.styles ?? []);
    } catch (error) {
      console.error("Failed to fetch styles:", error);
      toast.error("芸風一覧の取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStyles();
  }, [fetchStyles]);

  const handleAdd = async () => {
    if (!newId.trim() || !newName.trim()) {
      toast.error("芸風IDと芸風名は必須です。");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newId.trim(),
          name: newName.trim(),
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "message" in result && typeof result.message === "string"
            ? result.message
            : "芸風の追加に失敗しました。";
        throw new Error(message);
      }

      toast.success("芸風を追加しました。");
      setNewId("");
      setNewName("");
      setNewColor("");
      setIsAddMode(false);

      // 追加後に色を設定（POSTでは色を設定できないため）
      if (newColor.trim()) {
        await fetch(`/api/admin/styles/${encodeURIComponent(newId.trim())}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: newColor.trim() }),
        });
      }

      fetchStyles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "芸風の追加に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (style: Style) => {
    setEditingId(style.id);
    setEditName(style.name);
    setEditColor(style.color ?? "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) {
      toast.error("芸風名は必須です。");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/styles/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          color: editColor.trim() || null,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "message" in result && typeof result.message === "string"
            ? result.message
            : "芸風の更新に失敗しました。";
        throw new Error(message);
      }

      toast.success("芸風を更新しました。");
      setEditingId(null);
      setEditName("");
      setEditColor("");
      fetchStyles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "芸風の更新に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (styleId: string) => {
    if (!confirm("この芸風を削除しますか？")) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/styles/${encodeURIComponent(styleId)}`, {
        method: "DELETE",
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "message" in result && typeof result.message === "string"
            ? result.message
            : "芸風の削除に失敗しました。";
        throw new Error(message);
      }

      toast.success("芸風を削除しました。");
      fetchStyles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "芸風の削除に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div
        className={`${styles.dialog} ${styles.dialogLarge}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>芸風管理</h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.dialogCloseButton}
            aria-label="閉じる"
          >
            <X size={24} />
          </button>
        </div>
        <div className={styles.dialogBody}>
          {/* 追加ボタン */}
          {!isAddMode && (
            <button
              type="button"
              onClick={() => setIsAddMode(true)}
              className={`${styles.secondaryButton} ${styles.styleAddButton}`}
              disabled={isSaving}
            >
              <Plus size={18} />
              芸風を追加
            </button>
          )}

          {/* 追加フォーム */}
          {isAddMode && (
            <div className={styles.formSection}>
              <h3 className={styles.subLabel}>芸風を追加</h3>
              <div className={styles.formGroup}>
                <label htmlFor="newStyleId" className={styles.label}>
                  芸風ID（英小文字・数字・ハイフン）
                </label>
                <input
                  id="newStyleId"
                  type="text"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="例: manzai"
                  className={styles.input}
                  disabled={isSaving}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="newStyleName" className={styles.label}>
                  芸風名
                </label>
                <input
                  id="newStyleName"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: 漫才"
                  className={styles.input}
                  disabled={isSaving}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="newStyleColor" className={styles.label}>
                  色（HEX形式、任意）
                </label>
                <div className={styles.colorInputWrapper}>
                  <input
                    id="newStyleColor"
                    type="text"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    placeholder="例: #3b82f6"
                    className={styles.input}
                    disabled={isSaving}
                  />
                  {newColor && /^#[0-9a-fA-F]{6}$/.test(newColor) && (
                    <span
                      className={styles.colorPreview}
                      style={{ backgroundColor: newColor }}
                    />
                  )}
                </div>
              </div>
              <div className={styles.formActions}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddMode(false);
                    setNewId("");
                    setNewName("");
                    setNewColor("");
                  }}
                  className={styles.secondaryButton}
                  disabled={isSaving}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  className={styles.primaryButton}
                  disabled={isSaving || !newId.trim() || !newName.trim()}
                >
                  {isSaving ? "保存中..." : "追加"}
                </button>
              </div>
            </div>
          )}

          {/* 芸風一覧 */}
          <div className={styles.styleList}>
            <h3 className={styles.subLabel}>登録済みの芸風</h3>
            {isLoading ? (
              <p className={styles.statusText}>読み込み中...</p>
            ) : styleList.length === 0 ? (
              <p className={styles.statusText}>登録済みの芸風はありません。</p>
            ) : (
              <div className={styles.styleItems}>
                {styleList.map((style) => (
                  <div key={style.id} className={styles.styleItem}>
                    {editingId === style.id ? (
                      // 編集モード
                      <div className={styles.styleEditForm}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>芸風名</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className={styles.input}
                            disabled={isSaving}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>色（HEX形式）</label>
                          <div className={styles.colorInputWrapper}>
                            <input
                              type="text"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              placeholder="#3b82f6"
                              className={styles.input}
                              disabled={isSaving}
                            />
                            {editColor && /^#[0-9a-fA-F]{6}$/.test(editColor) && (
                              <span
                                className={styles.colorPreview}
                                style={{ backgroundColor: editColor }}
                              />
                            )}
                          </div>
                        </div>
                        <div className={styles.formActions}>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className={styles.secondaryButton}
                            disabled={isSaving}
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className={styles.primaryButton}
                            disabled={isSaving || !editName.trim()}
                          >
                            {isSaving ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // 表示モード
                      <div className={styles.styleItemContent}>
                        <div className={styles.styleInfo}>
                          <span className={styles.styleId}>{style.id}</span>
                          <span className={styles.styleName}>{style.name}</span>
                          {style.color && (
                            <span
                              className={styles.styleColorBadge}
                              style={{ color: style.color }}
                            >
                              {style.color}
                            </span>
                          )}
                        </div>
                        <div className={styles.styleActions}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(style)}
                            className={styles.iconButton}
                            aria-label="編集"
                            disabled={isSaving}
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(style.id)}
                            className={styles.iconButton}
                            aria-label="削除"
                            disabled={isSaving}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={styles.dialogFooter}>
          <button
            type="button"
            onClick={onClose}
            className={styles.secondaryButton}
            disabled={isSaving}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
