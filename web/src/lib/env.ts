/** サーバー側で使う環境変数。未設定なら早期に落とす。 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`環境変数 ${name} が未設定です（web/.env.local を確認）`);
  }
  return value.trim();
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, ""),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  /** service role / secret key。API ルート内でのみ参照すること。 */
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
};

// 苦手タグ判定の閾値（要件 9。暫定値、環境変数で変更可）
export const weakTagThreshold = {
  minAttempts: Number(process.env.NARUHODO_WEAK_TAG_MIN_ATTEMPTS ?? 3),
  maxAccuracy: Number(process.env.NARUHODO_WEAK_TAG_MAX_ACCURACY ?? 0.6),
};
