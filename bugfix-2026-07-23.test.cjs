/**
 * 2026-07-23 バグ修正の回帰テスト。
 * app.js は1ファイル即時実行なので、必要な関数だけをソースから切り出して評価する。
 * 実行: node bugfix-2026-07-23.test.cjs
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const results = [];
const pending = [];   // 非同期テストはここに積み、最後にまとめて待つ
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  if (!cond) process.exitCode = 1;
};

// ---- 1. リスト外フォームが60秒ごとに作り直されないこと -------------------
{
  // render() の special 分岐を切り出して、2回連続で呼んでも再生成されないことを確認
  const m = src.match(/if\(special\)\{if\(S\.specialRendered!==S\.view\)\{[\s\S]*?loadActivityFeed\(\);return\}/);
  ok('render: specialViewの再生成ガードが存在する', !!m);

  let rebuildCount = 0, deleteReloadCount = 0, feedReloadCount = 0;
  const S = { view: 'outside', specialRendered: '' };
  const el = { innerHTML: '' };
  const $ = () => el;
  const outsideView = () => { rebuildCount++; return '<form>'; };
  const scoreGuide = () => '<div>';
  const adminView = () => { rebuildCount++; return '<div>'; };
  const historyView = () => { rebuildCount++; return '<div>'; };
  const bindOutside = () => {};
  const bindAdmin = () => {};
  const bindHistory = () => {};
  const loadDeleteRequests = () => { deleteReloadCount++; };
  const loadActivityFeed = () => { feedReloadCount++; };
  const args = [S, $, outsideView, scoreGuide, adminView, historyView,
    bindOutside, bindAdmin, bindHistory, loadDeleteRequests, loadActivityFeed];
  const step = new Function('S', '$', 'outsideView', 'scoreGuide', 'adminView', 'historyView',
    'bindOutside', 'bindAdmin', 'bindHistory', 'loadDeleteRequests', 'loadActivityFeed',
    `const special=true;${m[0]}`);

  step(...args);
  const afterFirst = rebuildCount;
  // 60秒タイマーによる load() → render() を4回ぶん模擬
  for (let i = 0; i < 4; i++) step(...args);
  ok('リスト外: 初回のみ生成される', afterFirst === 1, `初回=${afterFirst}`);
  ok('リスト外: 以降の自動更新で入力欄が作り直されない（=入力が消えない）',
    rebuildCount === 1, `合計生成回数=${rebuildCount}（1であるべき）`);

  // 画面を切り替えたら作り直される
  S.view = 'scoreGuide';
  step(...args);
  ok('画面を切り替えたら再生成される', S.specialRendered === 'scoreGuide');

  // 管理者画面では削除依頼だけ再取得される
  S.view = 'admin'; S.specialRendered = 'admin';
  const before = deleteReloadCount;
  step(...args);
  ok('管理者: フォームは保持しつつ削除依頼だけ再取得', deleteReloadCount === before + 1);

  // 活動履歴画面では一覧だけ再取得される
  S.view = 'history'; S.specialRendered = '';
  step(...args);
  ok('活動履歴: 初回はビューを生成する', S.specialRendered === 'history');
  const feedBefore = feedReloadCount;
  step(...args); step(...args);
  ok('活動履歴: 自動更新では一覧だけ再取得される', feedReloadCount === feedBefore + 2, `再取得=${feedReloadCount - feedBefore}`);
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
  ok('保存後に切替状態がリセットされる（結果）', /\$\('drawer'\)\.classList\.add\('hidden'\);S\.formMode='';const gone=await removeLeadEvents/.test(src));
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

// ---- 9. 活動履歴ビュー ----------------------------------------------------
{
  ok('viewMeta に history が登録されている', /history:\['ACTIVITY LOG','活動履歴'/.test(src));
  ok('render の special に history が含まれる',
    /const special=\['outside','scoreGuide','admin','history'\]\.includes\(S\.view\)/.test(src));
  ok('サイドバーに活動履歴ナビがある',
    /data-view="history">活動履歴</.test(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')));
  ok('モバイルナビにも履歴がある',
    /data-view="history"><span>≡<\/span>履歴/.test(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')));
  const css = fs.readFileSync(path.join(__dirname, 'quick-report.css'), 'utf8')
    + fs.readFileSync(path.join(__dirname, 'admin.css'), 'utf8');
  ok('モバイルナビが6列になっている',
    !/grid-template-columns:repeat\(5,1fr\)/.test(css) && /repeat\(6,1fr\)/.test(css));
  ok('feed のスタイルが定義されている', /\.feed-item\{/.test(css) && /\.hist-tab\{/.test(css));

  // 絞り込みロジックを実際に評価する
  const m = src.match(/function renderActivityFeed\(\)\{[\s\S]*?const q=([^;]*);let items=\(S\.activities\|\|\[\]\)\.filter\((.*?)\);/);
  ok('renderActivityFeed の絞り込みを検出', !!m);
  const filter = new Function('S', 'x', `const q=${m[1]};return (${m[2]})(x)`);
  const acts = [
    { company: '甲信リユース', memo: '在庫多い', result: '担当接触 / 情報収集', type: '訪問', email: 'me@x.com' },
    { company: '北アルプス金属', memo: '不在', result: '不在 / 未設定', type: '訪問', email: 'other@x.com' },
  ];
  const S2 = (all, q) => ({ activities: acts, histAll: all, histQ: q, user: { email: 'me@x.com' } });
  ok('自分の記録のみ: 自分の分は残る', filter(S2(false, ''), acts[0]) === true);
  ok('自分の記録のみ: 他人の分は除外', filter(S2(false, ''), acts[1]) === false);
  ok('全員の記録: 他人の分も出る', filter(S2(true, ''), acts[1]) === true);
  ok('企業名で絞り込める', filter(S2(true, '北アルプス'), acts[1]) === true
    && filter(S2(true, '北アルプス'), acts[0]) === false);
  ok('メモでも絞り込める', filter(S2(true, '在庫'), acts[0]) === true);

  // 権限まわり
  const fm = src.match(/function feedItem\(a\)\{const mine=([^,]*),canDelete=([^,]*),canRequest=(.*?);/);
  ok('feedItem の権限判定を検出', !!fm);
  const perm = new Function('S', 'isAdmin', 'a',
    `const mine=${fm[1]},canDelete=${fm[2]},canRequest=${fm[3]};return {mine,canDelete,canRequest}`);
  const me = { email: 'me@x.com' };
  let p = perm({ user: me }, () => false, { email: 'me@x.com' });
  ok('FS: 自分の記録に削除依頼が出る', p.canRequest === true && p.canDelete === false);
  p = perm({ user: me }, () => false, { email: 'other@x.com' });
  ok('FS: 他人の記録には削除依頼が出ない', p.canRequest === false && p.canDelete === false);
  p = perm({ user: me }, () => true, { email: 'other@x.com' });
  ok('管理者: 他人の記録も直接削除できる（従来は不可能だった）', p.canDelete === true);
  p = perm({ user: me }, () => true, { email: 'me@x.com' });
  ok('管理者: 自分の記録も直接削除できる', p.canDelete === true && p.canRequest === false);

  ok('deleteActivity は管理者限定', /async function deleteActivity\(a\)\{if\(!a\|\|!isAdmin\(\)\)return;/.test(src));
  ok('deleteActivity は確認を取る', /deleteActivity[\s\S]{0,220}confirm\(/.test(src));
  ok('deleteActivity は残存履歴から最新フェーズを再計算する',
    /deleteActivity[\s\S]*?remaining=all\.filter\(x=>x\.leadId===a\.leadId&&x\.id!==a\.id\)/.test(src));
  ok('deleteActivity は履歴が無くなれば未着手へ戻す',
    /deleteActivity[\s\S]*?\['未着手','未割当','','','','','','未登録'\]/.test(src));
  ok('企業を開くボタンがある', /data-feed-lead=/.test(src));
  ok('リードが見つからない場合を握る', /この企業はリードマスターに見つかりません/.test(src));
}

// ---- 10. Googleカレンダーの後始末 ------------------------------------------
{
  ok('gtLeadId で予定を検索する', /privateExtendedProperty`?,\s*`gtLeadId=\$\{leadId\}`/.test(src)
    || /privateExtendedProperty['`]\s*,\s*`gtLeadId=/.test(src), 'findLeadEvents');
  ok('キャンセル済みの予定を除外する', /filter\(e=>e\.status!=='cancelled'\)/.test(src));
  ok('予定をDELETEする', /calendarFetch\(`events\/\$\{encodeURIComponent\(e\.id\)\}`,\{method:'DELETE'\}\)/.test(src));
  ok('404/410 も成功として数える（既に消えている場合）', /res\.ok\|\|res\.status===404\|\|res\.status===410/.test(src));

  // 予定を作る前に必ず古いものを消す
  ok('createCalendarEvent は作る前に古い予定を消す',
    /async function createCalendarEvent\([^)]*\)\{[^}]*?\}await removeLeadEvents\(r\.リードID\);const start=/.test(src));
  // 結果登録・初期化・最後の活動削除でも消す
  ok('結果を登録したら予定を消す',
    /S\.formMode='';const gone=await removeLeadEvents\(r\.リードID,endOfTodayISO\(\)\);await load\(\)/.test(src));
  ok('adminReset で予定を消す',
    /const removed=await removeLeadEvents\(r\.リードID\);await load\(\)/.test(src));
  ok('最後の活動を削除したときだけ予定を消す',
    /if\(!latest\)await removeLeadEvents\(a\.leadId\)/.test(src));

  // 失敗しても本処理を止めないこと（トークン切れ・API不調・権限なし）
  const m = src.match(/async function removeLeadEvents\(leadId,before=''\)\{([\s\S]*?)\n/);
  ok('removeLeadEvents を検出', !!m);
  ok('removeLeadEvents は try/catch で握りつぶす（保存を止めない）',
    /try\{[\s\S]*\}catch\{return 0\}/.test(m[1]), m[1].slice(0, 60));
  ok('トークンが無い/期限切れなら何もしない', /if\(!leadId\|\|!tokenFresh\(30000\)\)return 0/.test(m[1]));
  ok('findLeadEvents は失敗時に空配列を返す', /if\(!res\.ok\)return\[\]/.test(src));

  // 実際に動かして、削除→作成の順序と件数を確認する
  const fm = src.match(/async function findLeadEvents\(leadId,before=''\)\{[\s\S]*?\n/);
  const rm = src.match(/async function removeLeadEvents\(leadId,before=''\)\{[\s\S]*?\n/);
  const cf = src.match(/async function calendarFetch\(path,opt=\{\}\)\{[\s\S]*?\n/);
  const calls = [];
  const g = {
    S: { token: 't' },
    tokenFresh: () => true,
    fetch: async (u, opt = {}) => {
      const url = String(u);
      calls.push({ url, method: opt.method || 'GET' });
      if ((opt.method || 'GET') === 'GET') {
        return { ok: true, json: async () => ({ items: [
          { id: 'ev1', status: 'confirmed' },
          { id: 'ev2', status: 'cancelled' },
          { id: 'ev3', status: 'confirmed' },
        ] }) };
      }
      return { ok: true, status: 204 };
    },
  };
  const run = new Function('S', 'tokenFresh', 'fetch', 'URL', 'encodeURIComponent',
    `${cf[0]}${fm[0]}${rm[0]} return removeLeadEvents;`);
  const removeLeadEvents = run(g.S, g.tokenFresh, g.fetch, URL, encodeURIComponent);
  pending.push(removeLeadEvents('GT-0184').then(n => {
    ok('キャンセル済みを除いた2件だけ削除される', n === 2, `削除=${n}`);
    const dels = calls.filter(c => c.method === 'DELETE');
    ok('DELETE は ev1 と ev3 に対して発行される',
      dels.length === 2 && dels.every(d => /ev1|ev3/.test(d.url)), JSON.stringify(dels.map(d => d.url.split('/').pop())));
    ok('検索URLに gtLeadId が入る', /gtLeadId%3DGT-0184|gtLeadId=GT-0184/.test(calls[0].url), calls[0].url);
  }));
}

// ---- 11. correctStatus の全56通り（正本のフェーズを決める関数） -------------
{
  const m = src.match(/function correctStatus\(visit,deal,selected\)\{[\s\S]*?return selected\}/);
  ok('correctStatus を検出', !!m);
  const cs = new Function(`${m[0]} return correctStatus;`)();

  const visits = ['不在', '受付NG', '担当不在', '担当接触', '資料渡し', '再訪依頼', '商談化'];
  const deals = ['未設定', '情報収集', '見込み低', '見込み中', '見込み高', '見積依頼', '成約', '失注'];
  ok('選択肢の数が実装と一致（7×8=56通り）',
    visits.every(v => src.includes(`'${v}'`)) && deals.every(d => src.includes(`'${d}'`)));

  // 結果から確定できるものは、現在フェーズに関係なく確定値を返す
  ok('成約 は必ず成約', deals.includes('成約') && visits.every(v => cs(v, '成約', '商談中') === '成約'));
  ok('失注 は必ず見送り', visits.every(v => cs(v, '失注', '商談中') === '見送り'));
  ok('商談化 は商談中', deals.filter(d => !['成約', '失注'].includes(d)).every(d => cs('商談化', d, '未着手') === '商談中'));
  ok('見込み/見積依頼 は商談中',
    ['見込み低', '見込み中', '見込み高', '見積依頼'].every(d => cs('不在', d, '未着手') === '商談中'));
  ok('再訪依頼 は再訪予定', ['未設定', '情報収集'].every(d => cs('再訪依頼', d, '未着手') === '再訪予定'));

  // ここが今回の修正点：判断できない組み合わせは現在フェーズを尊重する
  const neutralV = ['不在', '受付NG', '担当不在', '担当接触', '資料渡し'];
  const neutralD = ['未設定', '情報収集'];
  ok('未着手に中立な結果 → 訪問済みへ進む',
    neutralV.every(v => neutralD.every(d => cs(v, d, '未着手') === '訪問済み')));
  ok('訪問予定に中立な結果 → 訪問済みへ進む',
    neutralV.every(v => neutralD.every(d => cs(v, d, '訪問予定') === '訪問済み')));
  ok('★商談中に「電話・不在」を記録しても商談中のまま（降格しない）',
    neutralV.every(v => neutralD.every(d => cs(v, d, '商談中') === '商談中')),
    `cs('不在','未設定','商談中')=${cs('不在', '未設定', '商談中')}`);
  ok('★成約済みに中立な結果を記録しても成約のまま',
    neutralV.every(v => neutralD.every(d => cs(v, d, '成約') === '成約')));
  ok('★再訪予定は維持される', neutralV.every(v => neutralD.every(d => cs(v, d, '再訪予定') === '再訪予定')));
  ok('★見送りは維持される', neutralV.every(v => neutralD.every(d => cs(v, d, '見送り') === '見送り')));
  ok('空の現在フェーズ → 訪問済み', cs('不在', '未設定', '') === '訪問済み');

  // 56通りすべてが statuses のいずれかを返す（未定義値を書き込まない）
  const statuses = ['未着手', '訪問予定', '訪問済み', '再訪予定', '商談中', '成約', '見送り'];
  const bad = [];
  for (const v of visits) for (const d of deals) for (const s of statuses) {
    const out = cs(v, d, s);
    if (!statuses.includes(out)) bad.push(`${v}/${d}/${s}→${out}`);
  }
  ok('全392通りが正規のステータスを返す', bad.length === 0, bad.slice(0, 3).join(', '));

  // リスト外は現在フェーズが無いので、必ず結果から決まる
  ok('リスト外活動は 訪問済み から始まる', /correctStatus\(vr,dr,'訪問済み'\)/.test(src));
}

// ---- 12. 訪問順が日付書式でも壊れないこと ---------------------------------
{
  ok('isNum ヘルパーがある', /const isNum=v=>\/\^\\d\+\$\/\.test/.test(src));
  const m = src.match(/const isNum=(v=>[^,]*),leadOrder=(r=>[^,]*),leadDate=(r=>.*?);/);
  ok('leadOrder / leadDate を検出', !!m);
  const f = new Function(`const isNum=${m[1]},leadOrder=${m[2]},leadDate=${m[3]};return {isNum,leadOrder,leadDate}`)();

  ok('正常な訪問順はそのまま', f.leadOrder({ 訪問順: '3' }) === '3');
  ok('日付化した訪問順は空になる（"1899-12-31番"と出さない）',
    f.leadOrder({ 訪問順: '1899-12-31' }) === '', f.leadOrder({ 訪問順: '1899-12-31' }));
  ok('空の訪問順は空', f.leadOrder({ 訪問順: '' }) === '');
  ok('正常な訪問予定日はそのまま', f.leadDate({ 訪問予定日: '2026-08-12' }) === '2026-08-12');
  ok('壊れた訪問予定日は空になる', f.leadDate({ 訪問予定日: '2026/8/12' }) === '');

  // 今日の訪問の並び替えが日付文字列で崩れないこと
  const sm = src.match(/x\.sort\(\(a,b\)=>S\.view==='today'\?\((\(isNum\(a\.訪問順\)[\s\S]*?999\))\)/);
  ok('todayの並び替えを検出', !!sm);
  ok('並び替えが isNum で守られている', /isNum\(a\.訪問順\)\?\+a\.訪問順:999/.test(src));
  const cmp = new Function('isNum', 'a', 'b', `return (${sm[1]})`);
  const rows = [{ 訪問順: '3' }, { 訪問順: '1899-12-31' }, { 訪問順: '1' }, { 訪問順: '2' }];
  const sorted = [...rows].sort((a, b) => cmp(f.isNum, a, b));
  ok('数値の訪問順は昇順、壊れた値は末尾',
    sorted.map(r => r.訪問順).join(',') === '1,2,3,1899-12-31', sorted.map(r => r.訪問順).join(','));
}

// ---- 13. カレンダー削除が先のアポを巻き込まないこと ------------------------
{
  ok('findLeadEvents が timeMax を受け取る', /async function findLeadEvents\(leadId,before=''\)/.test(src));
  ok('before があれば timeMax を付ける', /if\(before\)u\.searchParams\.set\('timeMax',before\)/.test(src));
  ok('removeLeadEvents が before を渡す', /async function removeLeadEvents\(leadId,before=''\)[\s\S]{0,120}findLeadEvents\(leadId,before\)/.test(src));
  ok('★結果登録では今日までの予定しか消さない（先のアポを守る）',
    /await removeLeadEvents\(r\.リードID,endOfTodayISO\(\)\)/.test(src));
  ok('予定の入れ直しでは全件消す（二重防止）',
    /async function createCalendarEvent\([^)]*\)\{[^}]*?\}await removeLeadEvents\(r\.リードID\);/.test(src));
  ok('endOfTodayISO は JST の23:59:59', /new Date\(`\$\{today\(\)\}T23:59:59\+09:00`\)\.toISOString\(\)/.test(src));
  ok('消した件数をFSに伝える', /カレンダーの予定\$\{gone\}件を消化済み/.test(src));
}

// ---- 14. 業種フィルタが自動更新で戻らないこと -----------------------------
{
  ok('業種プルダウンが選択状態を保つ',
    /categoryFilter'\)\.innerHTML=[\s\S]{0,200}\$\{x===S\.category\?'selected':''\}/.test(src));
  ok('都道府県プルダウンも保つ（既存）', /\$\{p===S\.area\?'selected':''\}/.test(src));
}

// ---- 15. 訪問予定を入れてもフェーズを下げないこと -------------------------
{
  const m = src.match(/const KEEP_PHASE=\[[^\]]*\],planPhase=(r=>[^;]*);/);
  ok('planPhase ヘルパーを検出', !!m);
  const planPhase = new Function(`const KEEP_PHASE=['商談中','成約','見送り'];return ${m[1]}`)();

  ok('★商談中に訪問予定を入れても商談中のまま', planPhase({ 営業ステータス: '商談中' }) === '商談中');
  ok('★成約に訪問予定を入れても成約のまま', planPhase({ 営業ステータス: '成約' }) === '成約');
  ok('★見送りに訪問予定を入れても見送りのまま', planPhase({ 営業ステータス: '見送り' }) === '見送り');
  ok('未着手に訪問予定を入れると訪問予定になる', planPhase({ 営業ステータス: '未着手' }) === '訪問予定');
  ok('訪問済みに訪問予定を入れると訪問予定になる', planPhase({ 営業ステータス: '訪問済み' }) === '訪問予定');
  ok('再訪予定に訪問予定を入れると訪問予定になる', planPhase({ 営業ステータス: '再訪予定' }) === '訪問予定');

  ok('persistPlan がフェーズを書き込みに使う',
    /values:\[\[phase,S\.user\.email,plan\.date,plan\.order\]\]/.test(src));
  ok('活動履歴の変更後ステータスにも同じフェーズを書く',
    /appendLog\(r,'訪問予定登録','予定登録',phase,/.test(src));
  ok('"訪問予定" のハードコードが persistPlan から消えている',
    !/values:\[\['訪問予定',S\.user\.email/.test(src));

  // 自分の訪問予定ビューから漏れないこと
  const f = src.match(/if\(S\.view==='mine'&&!\((.*?)\)\)return false;/);
  ok('mine のフィルタを検出', !!f);
  const mine = new Function('owner', 'today', 'r', `return (${f[1]})`);
  const own = () => true, td = () => '2026-08-08';
  ok('訪問予定は従来どおり出る', mine(own, td, { 営業ステータス: '訪問予定', 訪問予定日: '2026-08-20' }) === true);
  ok('再訪予定も出る', mine(own, td, { 営業ステータス: '再訪予定', 訪問予定日: '' }) === true);
  ok('★商談中でも予定日が未来なら出る（フェーズ維持の副作用を吸収）',
    mine(own, td, { 営業ステータス: '商談中', 訪問予定日: '2026-08-20' }) === true);
  ok('★成約でも予定日が未来なら出る',
    mine(own, td, { 営業ステータス: '成約', 訪問予定日: '2026-08-20' }) === true);
  ok('商談中で予定日が無ければ出ない',
    !mine(own, td, { 営業ステータス: '商談中', 訪問予定日: '' }));
  ok('商談中で予定日が過去なら出ない（要対応リスト側で拾う）',
    !mine(own, td, { 営業ステータス: '商談中', 訪問予定日: '2026-08-01' }));
  ok('未着手は出ない', !mine(own, td, { 営業ステータス: '未着手', 訪問予定日: '' }));
}

// ---- 出力 ------------------------------------------------------------------
function finish() {
  const passed = results.filter(r => r.pass).length;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
  }
  console.log(`
${passed}/${results.length} passed`);
}

Promise.all(pending).then(finish);
