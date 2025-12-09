// Resend SDK を利用してお問い合わせ内容をメール送信するエンドポイントです。
import { Resend } from "resend";

// フィールドごとの文字数制限
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 で規定されたメールアドレスの最大長
const MAX_MESSAGE_LENGTH = 5000;

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

type ContactResponse = {
  ok: true;
};

/**
 * 単一行テキストをサニタイズする関数
 * - UTF-8 NFC に正規化
 * - 制御文字（改行、タブ等）を除去（メールヘッダーインジェクション対策）
 * - 連続スペースを単一スペースに置換
 * - 文字数制限を適用
 */
function sanitizeSingleLine(raw: string, maxLength: number): string {
  if (!raw) {
    return "";
  }

  // 1. UTF-8 NFC に正規化
  let sanitized = raw.normalize("NFC");

  // 2. 制御文字を除去（改行、タブ、NULL文字など）
  // メールヘッダーインジェクション対策として改行・キャリッジリターンも除去
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");

  // 3. 連続スペース（半角・全角）を単一スペースに置換
  sanitized = sanitized.replace(/[\s\u3000]+/g, " ");

  // 4. 前後の空白を除去
  sanitized = sanitized.trim();

  // 5. 文字数制限
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * 複数行テキスト（メッセージ本文）をサニタイズする関数
 * - UTF-8 NFC に正規化
 * - 危険な制御文字を除去（改行・タブは許可）
 * - 極端な連続改行を制限
 * - 文字数制限を適用
 */
function sanitizeMultiLine(raw: string, maxLength: number): string {
  if (!raw) {
    return "";
  }

  // 1. UTF-8 NFC に正規化
  let sanitized = raw.normalize("NFC");

  // 2. 危険な制御文字を除去（改行 \n, キャリッジリターン \r, タブ \t は許可）
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 3. キャリッジリターンを統一（CRLF → LF, CR → LF）
  sanitized = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 4. 極端な連続改行を最大2つに制限
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

  // 5. 行内の連続スペースを単一スペースに置換（全角スペース含む）
  sanitized = sanitized.replace(/[^\S\n]+/g, " ");

  // 6. 前後の空白を除去
  sanitized = sanitized.trim();

  // 7. 文字数制限
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * メールアドレスの基本的な形式チェック
 * 厳密な RFC 準拠ではなく、一般的なメールアドレスパターンを検証
 */
function isValidEmail(email: string): boolean {
  if (!email) {
    return true; // 空は許可（任意入力のため）
  }
  // 基本的なメールアドレス形式チェック
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.CONTACT_TO_EMAIL;

  // 必須の環境変数が欠けている場合はここで弾いて利用者に分かりやすいメッセージを返します。
  const missingKeys = [
    !apiKey && "RESEND_API_KEY",
    !from && "RESEND_FROM_EMAIL",
    !to && "CONTACT_TO_EMAIL",
  ].filter((v): v is string => typeof v === "string");

  if (missingKeys.length > 0) {
    console.error("Contact API misconfiguration", { missingKeys });
    return json(500, {
      message: "メール送信に失敗しました。時間を置いて再度お試しください。",
      missingKeys,
    });
  }

  // フロントエンドから送られてきた JSON を安全にパースします。
  let payload: ContactPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { message: "JSON ボディを解析できませんでした。" });
  }

  // サニタイズ処理: UTF-8正規化、制御文字除去、文字数制限
  const nameRaw = typeof payload.name === "string" ? payload.name : "";
  const emailInputRaw = typeof payload.email === "string" ? payload.email : "";
  const messageInputRaw = typeof payload.message === "string" ? payload.message : "";

  const name = sanitizeSingleLine(nameRaw, MAX_NAME_LENGTH);
  const email = sanitizeSingleLine(emailInputRaw, MAX_EMAIL_LENGTH);
  const message = sanitizeMultiLine(messageInputRaw, MAX_MESSAGE_LENGTH);

  // バリデーション: メッセージは必須
  if (!message) {
    return json(400, { message: "お問い合わせ内容を入力してください。" });
  }

  // バリデーション: メールアドレス形式チェック
  if (email && !isValidEmail(email)) {
    return json(400, { message: "メールアドレスの形式が正しくありません。" });
  }

  const ensuredApiKey = apiKey as string;
  const ensuredFrom = from as string;
  const ensuredTo = to as string;

  // Resend に渡す件名と本文を組み立てます。
  const subject = "【Lafter】お問い合わせ";
  const summary = [
    `お名前: ${name || "未入力"}`,
    `メールアドレス: ${email || "未入力"}`,
    "",
    "お問い合わせ内容:",
    message,
  ].join("\n");

  const resend = new Resend(ensuredApiKey);

  try {
    await resend.emails.send({
      from: `Lafter <${ensuredFrom}>`,
      to: ensuredTo.split(",").map((address) => address.trim()).filter(Boolean),
      replyTo: email || undefined,
      subject,
      text: summary,
    });
  } catch (error) {
    console.error("Failed to send contact email via Resend", error);
    return json(502, { message: "メール送信に失敗しました。時間を置いて再度お試しください。" });
  }

  const response: ContactResponse = { ok: true };
  return json(200, response);
}
