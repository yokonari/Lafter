import type { Session, User } from "better-auth/types";
// better-auth/types から丁寧に型定義を取り込みます。

// 認証済みコンテキストで利用する共通の環境型を丁寧に定義します。
export type AdminEnv = {
  Variables: {
    session?: Session;
    user?: User;
  };
};
