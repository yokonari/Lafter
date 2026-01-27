"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { X } from "lucide-react";
import type { ComedianRow } from "../ComedianAdminSection";
import { ChannelSelector, type SelectedChannel } from "./ChannelSelector";
import { AliasSelector, type ArtistAlias } from "./AliasSelector";
import styles from "../../adminTheme.module.scss";

type ComedianFormDialogProps = {
  comedian: ComedianRow | null;
  onSuccess: () => void;
  onClose: () => void;
};

type FormData = {
  name: string;
  slug: string;
  kana: string;
  startedOn: string;
  agencyId: string;
  styles: string[];
  channels: SelectedChannel[];
  aliases: ArtistAlias[];
  description: string;
};

type Agency = {
  id: string;
  name: string;
};

type StyleOption = {
  id: string;
  name: string;
};

export function ComedianFormDialog({
  comedian,
  onSuccess,
  onClose,
}: ComedianFormDialogProps) {
  const isEdit = Boolean(comedian);
  const [formData, setFormData] = useState<FormData>({
    name: comedian?.name || "",
    slug: comedian?.slug || "",
    kana: comedian?.kana || "",
    startedOn: comedian?.startedOn || "",
    agencyId: comedian?.agencyId || "",
    styles: comedian?.styles || [],
    channels: [],
    aliases: [],
    description: "",
  });

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [styleOptions, setStyleOptions] = useState<StyleOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isAgencyDialogOpen, setIsAgencyDialogOpen] = useState(false);
  const [newAgencyId, setNewAgencyId] = useState("");
  const [newAgencyName, setNewAgencyName] = useState("");
  const [isAgencySubmitting, setIsAgencySubmitting] = useState(false);
  const [isStyleDialogOpen, setIsStyleDialogOpen] = useState(false);
  const [newStyleId, setNewStyleId] = useState("");
  const [newStyleName, setNewStyleName] = useState("");
  const [isStyleSubmitting, setIsStyleSubmitting] = useState(false);

  const fetchAgencies = useCallback(async () => {
    // 事務所一覧を取得します。
    try {
      const response = await fetch("/api/admin/agencies");
      if (!response.ok) {
        throw new Error("事務所一覧の取得に失敗しました。");
      }
      const data = (await response.json()) as { agencies: Agency[] };
      setAgencies(data.agencies || []);
    } catch (error) {
      console.error("Failed to fetch agencies:", error);
      toast.error("事務所一覧の取得に失敗しました。");
    }
  }, []);

  const fetchStyles = useCallback(async () => {
    // 芸風一覧を取得します。
    try {
      const response = await fetch("/api/admin/styles");
      if (!response.ok) {
        throw new Error("芸風一覧の取得に失敗しました。");
      }
      const data = (await response.json()) as { styles: StyleOption[] };
      setStyleOptions(data.styles || []);
    } catch (error) {
      console.error("Failed to fetch styles:", error);
      toast.error("芸風一覧の取得に失敗しました。");
    }
  }, []);

  // 事務所一覧を取得
  useEffect(() => {
    fetchAgencies();
  }, [fetchAgencies]);

  // 芸風一覧を取得
  useEffect(() => {
    fetchStyles();
  }, [fetchStyles]);

  // 編集時にチャンネル情報を取得
  useEffect(() => {
    if (comedian) {
      const comedianId = comedian.id;
      async function fetchComedianDetails() {
        try {
          const response = await fetch(`/api/admin/comedian/${comedianId}`);
          if (!response.ok) {
            throw new Error("芸人情報の取得に失敗しました。");
          }
          const data = (await response.json()) as {
            comedian: {
              channels: Array<{
                channelId: string;
                role: "official" | "group";
                description?: string;
              }>;
              aliases: Array<{
                name: string;
                kana: string;
              }>;
            };
          };

          // チャンネル情報にnameを追加するため、各チャンネルの詳細を取得
          const channelsWithNames = await Promise.all(
            data.comedian.channels.map(async (ch) => {
              try {
                const channelResponse = await fetch(
                  `/api/admin/channels/search?q=${encodeURIComponent(ch.channelId)}`
                );
                if (channelResponse.ok) {
                  const channelData = (await channelResponse.json()) as {
                    channels: Array<{ id: string; name: string }>;
                  };
                  const channelInfo = channelData.channels.find((c) => c.id === ch.channelId);
                  return {
                    channelId: ch.channelId,
                    name: channelInfo?.name || ch.channelId,
                    role: ch.role,
                    description: ch.description,
                  };
                }
                return {
                  channelId: ch.channelId,
                  name: ch.channelId,
                  role: ch.role,
                  description: ch.description,
                };
              } catch {
                return {
                  channelId: ch.channelId,
                  name: ch.channelId,
                  role: ch.role,
                  description: ch.description,
                };
              }
            })
          );

          setFormData((prev) => ({
            ...prev,
            channels: channelsWithNames,
            aliases: data.comedian.aliases || [],
          }));
        } catch (error) {
          console.error("Failed to fetch comedian details:", error);
          toast.error("芸人情報の取得に失敗しました。");
        }
      }

      fetchComedianDetails();
    }
  }, [comedian]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // バリデーション
    if (!formData.name.trim()) {
      toast.error("芸人名は必須です。");
      return;
    }

    if (!formData.slug.trim()) {
      toast.error("スラッグは必須です。");
      return;
    }

    if (!formData.agencyId) {
      toast.error("事務所は必須です。");
      return;
    }

    if (isEdit && !comedian) {
      toast.error("芸人情報が見つかりません。");
      return;
    }

    setIsSubmitting(true);

    try {
      const url = isEdit
        ? `/api/admin/comedian/${comedian!.id}`
        : "/api/admin/comedian";

      const method = isEdit ? "PATCH" : "POST";

      const body = {
        name: formData.name.trim(),
        slug: formData.slug.trim(),
        kana: formData.kana.trim() || undefined,
        startedOn: formData.startedOn.trim() || undefined,
        agencyId: formData.agencyId,
        styles: formData.styles.length > 0 ? formData.styles : undefined,
        channels:
          formData.channels.length > 0
            ? formData.channels.map((ch) => ({
                channelId: ch.channelId,
                role: ch.role,
                description: ch.description || undefined,
              }))
            : undefined,
        aliases:
          formData.aliases.length > 0
            ? formData.aliases.map((a) => ({
                name: a.name.trim(),
                kana: a.kana.trim() || undefined,
              }))
            : undefined,
        description: formData.description.trim() || undefined,
      };

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          result && typeof result === "object" && "message" in result && typeof result.message === "string"
            ? result.message
            : isEdit
            ? "更新に失敗しました。"
            : "作成に失敗しました。";
        throw new Error(message);
      }

      toast.success(isEdit ? "芸人を更新しました。" : "芸人を作成しました。");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "エラーが発生しました。");
      setIsSubmitting(false);
    }
  };

  const handleSlugBlur = async () => {
    if (!formData.slug.trim()) {
      setSlugError(null);
      return;
    }

    // スラッグの形式チェック
    if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      setSlugError("スラッグは英小文字、数字、ハイフンのみ使用できます。");
      return;
    }

    // TODO: 一意性チェック（APIエンドポイントが必要）
    setSlugError(null);
  };

  const handleStyleToggle = (styleId: string) => {
    if (formData.styles.includes(styleId)) {
      setFormData({
        ...formData,
        styles: formData.styles.filter((s) => s !== styleId),
      });
    } else {
      if (formData.styles.length >= 5) {
        toast.warning("芸風は最大5つまで選択できます。");
        return;
      }
      setFormData({
        ...formData,
        styles: [...formData.styles, styleId],
      });
    }
  };

  const handleOpenAgencyDialog = () => {
    // 事務所追加の入力値を初期化します。
    setNewAgencyId("");
    setNewAgencyName("");
    setIsAgencyDialogOpen(true);
  };

  const handleOpenStyleDialog = () => {
    // 芸風追加の入力値を初期化します。
    setNewStyleId("");
    setNewStyleName("");
    setIsStyleDialogOpen(true);
  };

  const handleCreateAgency = async () => {
    if (!newAgencyId.trim() || !newAgencyName.trim()) {
      toast.error("事務所IDと事務所名を入力してください。");
      return;
    }

    setIsAgencySubmitting(true);
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newAgencyId.trim(),
          name: newAgencyName.trim(),
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "message" in result && typeof result.message === "string"
            ? result.message
            : "事務所の追加に失敗しました。";
        throw new Error(message);
      }

      // 追加後に一覧を更新し、作成した事務所を選択します。
      await fetchAgencies();
      setFormData((prev) => ({ ...prev, agencyId: newAgencyId.trim() }));
      setIsAgencyDialogOpen(false);
      toast.success("事務所を追加しました。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "事務所の追加に失敗しました。");
    } finally {
      setIsAgencySubmitting(false);
    }
  };

  const handleCreateStyle = async () => {
    if (!newStyleId.trim() || !newStyleName.trim()) {
      toast.error("芸風IDと芸風名を入力してください。");
      return;
    }

    setIsStyleSubmitting(true);
    try {
      const response = await fetch("/api/admin/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newStyleId.trim(),
          name: newStyleName.trim(),
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

      await fetchStyles();
      setFormData((prev) => {
        if (prev.styles.includes(newStyleId.trim())) {
          return prev;
        }
        if (prev.styles.length >= 5) {
          toast.warning("芸風は最大5つまで選択できます。");
          return prev;
        }
        return { ...prev, styles: [...prev.styles, newStyleId.trim()] };
      });
      setIsStyleDialogOpen(false);
      toast.success("芸風を追加しました。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "芸風の追加に失敗しました。");
    } finally {
      setIsStyleSubmitting(false);
    }
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div
        className={`${styles.dialog} ${styles.dialogLarge}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>
            {isEdit ? "芸人を編集" : "芸人を追加"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.dialogCloseButton}
            aria-label="閉じる"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.dialogBody}>
            <div className={styles.formGroup}>
              <label htmlFor="name" className={styles.label}>
                芸人名<span className={styles.required}>*</span>
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className={styles.input}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="slug" className={styles.label}>
                スラッグ<span className={styles.required}>*</span>
              </label>
              <input
                id="slug"
                type="text"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value.toLowerCase() })
                }
                onBlur={handleSlugBlur}
                className={styles.input}
                placeholder="例: jarujaru"
                required
              />
              {slugError && (
                <p className={styles.errorText}>{slugError}</p>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="kana" className={styles.label}>
                読み仮名
              </label>
              <input
                id="kana"
                type="text"
                value={formData.kana}
                onChange={(e) =>
                  setFormData({ ...formData, kana: e.target.value })
                }
                className={styles.input}
                placeholder="例: じゃるじゃる"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="startedOn" className={styles.label}>
                活動開始年
              </label>
              <select
                id="startedOn"
                value={formData.startedOn}
                onChange={(e) =>
                  setFormData({ ...formData, startedOn: e.target.value })
                }
                className={styles.input}
              >
                <option value="">選択してください</option>
                {(() => {
                  // 1980年から今年までの年を表示します。
                  const currentYear = new Date().getFullYear();
                  const years: number[] = [];
                  for (let year = currentYear; year >= 1980; year -= 1) {
                    years.push(year);
                  }
                  return years.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ));
                })()}
              </select>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="agencyId" className={styles.label}>
                  事務所<span className={styles.required}>*</span>
                </label>
                <button
                  type="button"
                  onClick={handleOpenAgencyDialog}
                  className={styles.secondaryButton}
                >
                  追加
                </button>
              </div>
              <select
                id="agencyId"
                value={formData.agencyId}
                onChange={(e) =>
                  setFormData({ ...formData, agencyId: e.target.value })
                }
                className={styles.input}
                required
              >
                <option value="">選択してください</option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.labelRow}>
                <label className={styles.label}>芸風（最大5つ）</label>
                <button
                  type="button"
                  onClick={handleOpenStyleDialog}
                  className={styles.secondaryButton}
                >
                  追加
                </button>
              </div>
              <div className={styles.checkboxGroup}>
                {styleOptions.length === 0 ? (
                  <p className={styles.statusText}>芸風が登録されていません。</p>
                ) : (
                  styleOptions.map((style) => (
                    <label key={style.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={formData.styles.includes(style.id)}
                        onChange={() => handleStyleToggle(style.id)}
                      />
                      <span>{style.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <ChannelSelector
              selectedChannels={formData.channels}
              onChange={(channels) =>
                setFormData({ ...formData, channels })
              }
            />

            <AliasSelector
              selectedAliases={formData.aliases}
              onChange={(aliases) =>
                setFormData({ ...formData, aliases })
              }
            />

            <div className={styles.formGroup}>
              <label htmlFor="description" className={styles.label}>
                説明
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className={styles.textarea}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>

          <div className={styles.dialogFooter}>
            <button
              type="button"
              onClick={onClose}
              className={styles.secondaryButton}
              disabled={isSubmitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? isEdit
                  ? "更新中..."
                  : "作成中..."
                : isEdit
                ? "更新"
                : "作成"}
            </button>
          </div>
        </form>
      </div>
      {isAgencyDialogOpen && (
        <div
          className={styles.dialogOverlay}
          onClick={(e) => {
            // 背景クリック時は親ダイアログを閉じずに事務所追加だけ閉じます。
            e.stopPropagation();
            setIsAgencyDialogOpen(false);
          }}
        >
          <div
            className={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.dialogHeader}>
              <h2 className={styles.dialogTitle}>事務所を追加</h2>
              <button
                type="button"
                onClick={() => setIsAgencyDialogOpen(false)}
                className={styles.dialogCloseButton}
                aria-label="閉じる"
              >
                <X size={24} />
              </button>
            </div>
            <div className={styles.dialogBody}>
              <div className={styles.formGroup}>
                <label htmlFor="newAgencyId" className={styles.label}>
                  事務所ID<span className={styles.required}>*</span>
                </label>
                <input
                  id="newAgencyId"
                  type="text"
                  value={newAgencyId}
                  onChange={(e) => setNewAgencyId(e.target.value.toLowerCase())}
                  className={styles.input}
                  placeholder="例: yoshimoto"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="newAgencyName" className={styles.label}>
                  事務所名<span className={styles.required}>*</span>
                </label>
                <input
                  id="newAgencyName"
                  type="text"
                  value={newAgencyName}
                  onChange={(e) => setNewAgencyName(e.target.value)}
                  className={styles.input}
                  placeholder="例: 吉本興業"
                />
              </div>
            </div>
            <div className={styles.dialogFooter}>
              <button
                type="button"
                onClick={() => setIsAgencyDialogOpen(false)}
                className={styles.secondaryButton}
                disabled={isAgencySubmitting}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCreateAgency}
                className={styles.primaryButton}
                disabled={isAgencySubmitting}
              >
                {isAgencySubmitting ? "追加中..." : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}
      {isStyleDialogOpen && (
        <div
          className={styles.dialogOverlay}
          onClick={(e) => {
            // 背景クリック時は親ダイアログを閉じずに芸風追加だけ閉じます。
            e.stopPropagation();
            setIsStyleDialogOpen(false);
          }}
        >
          <div
            className={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.dialogHeader}>
              <h2 className={styles.dialogTitle}>芸風を追加</h2>
              <button
                type="button"
                onClick={() => setIsStyleDialogOpen(false)}
                className={styles.dialogCloseButton}
                aria-label="閉じる"
              >
                <X size={24} />
              </button>
            </div>
            <div className={styles.dialogBody}>
              <div className={styles.formGroup}>
                <label htmlFor="newStyleId" className={styles.label}>
                  芸風ID<span className={styles.required}>*</span>
                </label>
                <input
                  id="newStyleId"
                  type="text"
                  value={newStyleId}
                  onChange={(e) => setNewStyleId(e.target.value.toLowerCase())}
                  className={styles.input}
                  placeholder="例: manzai"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="newStyleName" className={styles.label}>
                  芸風名<span className={styles.required}>*</span>
                </label>
                <input
                  id="newStyleName"
                  type="text"
                  value={newStyleName}
                  onChange={(e) => setNewStyleName(e.target.value)}
                  className={styles.input}
                  placeholder="例: 漫才"
                />
              </div>
            </div>
            <div className={styles.dialogFooter}>
              <button
                type="button"
                onClick={() => setIsStyleDialogOpen(false)}
                className={styles.secondaryButton}
                disabled={isStyleSubmitting}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCreateStyle}
                className={styles.primaryButton}
                disabled={isStyleSubmitting}
              >
                {isStyleSubmitting ? "追加中..." : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
