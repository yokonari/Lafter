import type { Session, User } from "better-auth";

// 認証済みコンテキストで利用する共通の環境型を丁寧に定義します。
export type AdminEnv = {
  Variables: {
    session: Session;
    user: User;
  };
};
