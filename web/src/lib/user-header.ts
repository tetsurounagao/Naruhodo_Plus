/** middleware がセッション検証後に付ける、信頼できるユーザー ID ヘッダ名。
 *  middleware（Edge）と Route Handler の両方から import されるので、
 *  next/headers 等に依存しない単独の定数ファイルにしている。 */
export const USER_ID_HEADER = "x-naruhodo-user";
