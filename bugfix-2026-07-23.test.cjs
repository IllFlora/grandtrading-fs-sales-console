/**
 * 2026-07-23 バグ修正の回帰テスト。
 * app.js は1ファイル即時実行なので、必要な関数だけをソースから切り出して評価する。
 * 実行: node bugfix-2026-07-23.test.cjs
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  if (!cond) process.exitCode = 1;
};

// ---- 1. リスト外フォームが60秒ごとに作り直されないこと -------------------
{
  // render() の special 分岐を切り出して、2回連続で呼んでも再生成されないことを確認
  const m = src.match(/if\(special\)\{if\(S\.specialRendered!==S\.view\)\{[\s\S]*?\}else if\(S\.view==='admin'\)loadDeleteRequests\(\);return\}/);
  ok('render: specialViewの再生成ガードが存在する', !!m);

  let rebuildCount = 0, deleteReloadCount = 0;
  const S = { view: 'outside', specialRendered: '' };
  const el = { innerHTML: '' };
  const $ = () => el;
  const outsideView = () => { rebuildCount++; return '<form>'; };
  const scoreGuide = () => '<div>';
  const adminView = () => { rebuildCount++; return '<div>'; };
  const bindOutside = () => {};
  const bindAdmin = () => {};
  const loadDeleteRequests = () => { deleteReloadCount++; };
  const step = new Function('S', '$', 'outsideView', 'scoreGuide', 'adminView',
    'bindOutside', 'bindAdmin', 'loadDeleteRequests',
    `const special=true;${m[0]}`);

  step(S, $, outsideView, scoreGuide, adminView, bindOutside, bindAdmin, loadDeleteRequests);
  const afterFirst = rebuildCount;
  // 60秒タイマーによる load() → render() を4回ぶん模擬
  for (let i = 0; i < 4; i++) step(S, $, outsideView, scoreGuide, adminView, bindOutside, bindAdmin, loadDeleteRequests);
  ok('リスト外: 初回のみ生成される', afterFirst === 1, `初回=${afterFirst}`);
  ok('リスト外: 以降の自動更新で入力欄が作り直されない（=入力が消えない）',
    rebuildCount === 1, `合計生成回数=${rebuildCount}（1であるべき）`);

  // 画面を切り替えたら作り直される
  S.view = 'scoreGuide';
  step(S, $, outsideView, scoreGuide, adminView, bindOutside, bindAdmin, loadDeleteRequests);
  ok('画面を切り替えたら再生成される', S.specialRendered === 'scoreGuide');

  // 管理者画面では削除依頼だけ再取得される
  S.view = 'admin'; S.specialRendered = 'admin';
  const before = deleteReloadCount;
  step(S, $, outsideView, scoreGuide, adminView, bindOutside, bindAdmin, loadDeleteRequests);
  ok('管理者: フォームは保持しつつ削除依頼だけ再取得', deleteReloadCount === before + 1);
}

// ---- 2. load() の行番号がシート実行と一致すること -------------------------
{
  const m = src.match(/S\.rows=\(d\.values\|\|\[\]\)\.map[\s\S]*?return r\}\);/);
  ok('load: 行番号の算出が map→filter 順になっている', !!m);

  const H = ['リードID', '企業名'];
  const build = new Function('d', 'H', `let S={};${m[0]}return S.rows`);
  // 3行目(シート上)にリードID空欄の行を混ぜる
  const values = [
    ['GT-0001', 'A社'],   // シート2行目
    ['', ''],             // シート3行目（空行）
    ['GT-0002', 'B社'],   // シート4行目
    ['GT-0003', 'C社'],   // シート5行目
  ];
  const rows = build({ values }, H);
  ok('空行があっても A社 の行番号が正しい', rows[0]._row === 2, `_row=${rows[0]._row}`);
  ok('空行の後でも B社 の行番号が正しい（ズレない）', rows[1]._row === 4, `_row=${rows[1]._row} (期待4)`);
  ok('空行の後でも C社 の行番号が正しい（ズレない）', rows[2]._row === 5, `_row=${rows[2]._row} (期待5)`);
}

// ---- 3. 結果登録で訪問予定日がクリアされること ----------------------------
{
  const m = src.match(/range:`'\$\{CFG\.masterSheet\}'!L\$\{r\._row\}:S\$\{r\._row\}`,values:\[\[st,S\.user\.email,([^\]]*?)\]\]/);
  ok('saveResult: L:S の書き込みを検出', !!m);
  const fields = m[1].split(',').map(s => s.trim());
  ok('saveResult: 訪問予定日(N列)を空にしている', fields[0] === "''", `実際=${fields[0]}`);
  ok('saveResult: 訪問順(O列)を空にしている', fields[1] === "''", `実際=${fields[1]}`);
  ok('saveResult: 最終対応日に today() を書いている', fields[2] === 'today()', `実際=${fields[2]}`);
}

// ---- 4. 担当者の奪取に確認ダイアログが入ること ----------------------------
{
  const m = src.match(/function confirmOwnerTakeover\(r\)\{[\s\S]*?\n/);
  ok('confirmOwnerTakeover が定義されている', !!m);

  const fn = new Function('owner', 'staffName', 'confirm',
    `${m[0]} return confirmOwnerTakeover;`);
  const mk = (confirmReturns) => {
    let asked = null;
    const f = fn(
      (r) => r.営業担当 === 'me@x.com',
      (e) => ({ 'other@x.com': '佐藤' }[e] || e),
      (msg) => { asked = msg; return confirmReturns; }
    );
    return { f, get asked() { return asked; } };
  };

  let t = mk(true);
  ok('未割当なら確認しない', t.f({ 営業担当: '未割当' }) === true && t.asked === null);
  t = mk(true);
  ok('空欄なら確認しない', t.f({ 営業担当: '' }) === true && t.asked === null);
  t = mk(true);
  ok('自分の担当なら確認しない', t.f({ 営業担当: 'me@x.com' }) === true && t.asked === null);

  t = mk(false);
  const denied = t.f({ 営業担当: 'other@x.com' });
  ok('他人の担当なら確認する', t.asked !== null);
  ok('確認に担当者名が入る', String(t.asked).includes('佐藤'), t.asked);
  ok('キャンセルすると false（＝保存されない）', denied === false);

  t = mk(true);
  ok('OKすれば true（＝保存に進む）', t.f({ 営業担当: 'other@x.com' }) === true);

  ok('saveResult が確認を通す', /async function saveResult\(r\)\{if\(!confirmOwnerTakeover\(r\)\)return;/.test(src));
  ok('savePlan が確認を通す', /async function savePlan\(r\)\{if\(!confirmOwnerTakeover\(r\)\)return;/.test(src));
}

// ---- 5. 予定フォームと結果フォームを切り替えられること --------------------
{
  const m = src.match(/function open\(r\)\{const planning=(.*?),admin=/);
  ok('open: planning の算出を検出', !!m);
  const calc = new Function('S', 'r', `return ${m[1]}`);
  const r = { 営業ステータス: '訪問予定' };

  ok('既定: 訪問予定 は結果フォーム', calc({ formMode: '' }, r) === false);
  ok('切替後: 訪問予定 でも予定フォームを出せる（日付を入れ直せる）',
    calc({ formMode: 'plan' }, r) === true);
  ok('既定: 未着手 は予定フォーム',
    calc({ formMode: '' }, { 営業ステータス: '未着手' }) === true);
  ok('切替後: 未着手 でも結果フォームを出せる',
    calc({ formMode: 'result' }, { 営業ステータス: '未着手' }) === false);
  ok('切替ボタンが描画される', /id="formSwitch"/.test(src));
  ok('切替ボタンにハンドラが付く', /\$\('formSwitch'\)\.onclick=\(\)=>\{S\.formMode=planning\?'result':'plan';open\(r\)\}/.test(src));
  ok('別の企業を開くと切替状態がリセットされる', /if\(l\)\{S\.formMode='';open\(/.test(src));
  ok('保存後に切替状態がリセットされる（結果）', /\$\('drawer'\)\.classList\.add\('hidden'\);S\.formMode='';await load\(\);toast\(`\$\{st\}として結果/.test(src));
  ok('保存後に切替状態がリセットされる（予定）', /\$\('drawer'\)\.classList\.add\('hidden'\);S\.formMode='';await load\(\);toast\(plan\.calendar/.test(src));
}

// ---- 6. リスト外登録後に登録先が見える画面へ遷移すること ------------------
{
  ok('リスト外: 商談管理へ飛ばさない', !/await load\(\);S\.view='appointments';applyView\(\)/.test(src));
  ok('リスト外: 企業リストへ遷移する', /await load\(\);S\.view='all';S\.q=company;/.test(src));
  ok('リスト外: 検索欄に社名が入る', /\$\('search'\)\.value=company;/.test(src));
  ok('リスト外: 他の絞り込みを解除する',
    /S\.area='';S\.areaQ='';S\.status='';S\.category='';S\.min=0;/.test(src));
}

// ---- 7. 保存失敗時に同期ランプが戻ること ----------------------------------
{
  const m = src.match(/async function saveResult\(r\)\{[\s\S]*?catch\(e\)\{([^}]*)\}\}/);
  ok('saveResult: catch を検出', !!m);
  ok('saveResult: 失敗時に同期エラー表示へ戻す', /sync\('','同期エラー'\)/.test(m[1]), m[1]);
}

// ---- 8. 再認証後に開いていた企業が復元されること --------------------------
{
  ok('restoreReturnState が lead を読む', /S\.pendingLead=x\.lead\|\|''/.test(src));
  ok('startApp が復元して開く',
    /if\(S\.pendingLead\)\{const lead=S\.rows\.find\(x=>x\.リードID===S\.pendingLead\);S\.pendingLead='';if\(lead\)\{S\.formMode='';open\(lead\)\}\}/.test(src));
  ok('S に pendingLead / formMode / specialRendered が初期化されている',
    /specialRendered:'',formMode:'',pendingLead:''/.test(src));
}

// ---- 出力 ------------------------------------------------------------------
const passed = results.filter(r => r.pass).length;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
}
console.log(`\n${passed}/${results.length} passed`);
