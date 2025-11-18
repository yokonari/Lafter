// Resend SDK を利用してお問い合わせ内容をメール送信するエンドポイントです。
import { Resend } from "resend";

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

type ContactResponse = {
  ok: true;
};

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

  // 空白のみの値を避けるためにトリムを行います。
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const emailRaw = typeof payload.email === "string" ? payload.email.trim() : "";
  const messageRaw = typeof payload.message === "string" ? payload.message.trim() : "";

  if (!messageRaw) {
    return json(400, { message: "お問い合わせ内容を入力してください。" });
  }

  const ensuredApiKey = apiKey as string;
  const ensuredFrom = from as string;
  const ensuredTo = to as string;

  // Resend に渡す件名と本文を組み立てます。
  const subject = "【Lafter】お問い合わせ";
  const summary = [
    `お名前: ${name || "未入力"}`,
    `メールアドレス: ${emailRaw || "未入力"}`,
    "",
    "お問い合わせ内容:",
    messageRaw,
  ].join("\n");

  const resend = new Resend(ensuredApiKey);

  try {
    await resend.emails.send({
      from: `Lafter <${ensuredFrom}>`,
      to: ensuredTo.split(",").map((address) => address.trim()).filter(Boolean),
      replyTo: emailRaw || undefined,
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
