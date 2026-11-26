import { DDRAGON_LATEST_PATH } from '../shared/paths.ts';
import { syncDdragon } from './ddragon.ts';

async function main(): Promise<void> {
  console.log('Data Dragon 最新パッチデータを取得中...');
  const snapshot = await syncDdragon(DDRAGON_LATEST_PATH);
  const champCount = Object.keys(snapshot.champions).length;
  const itemCount = Object.keys(snapshot.items).length;
  const runeCount = Object.keys(snapshot.runes).length;
  const spellCount = Object.keys(snapshot.spells).length;

  console.log(`同期完了: パッチ ${snapshot.patch}`);
  console.log(`  チャンピオン: ${champCount}体 / アイテム: ${itemCount}個 / ルーン: ${runeCount}個 / サモナースペル: ${spellCount}個`);
  console.log(`  保存先: ${DDRAGON_LATEST_PATH}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[エラー] Data Dragon 同期に失敗しました: ${message}`);
  process.exit(1);
});
