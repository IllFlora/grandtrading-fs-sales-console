const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

function storage(initial={}){const data=new Map(Object.entries(initial));return{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}
function element(){return new Proxy({dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},style:{},addEventListener(){},querySelectorAll(){return[]},querySelector(){return element()}},{get:(o,k)=>k in o?o[k]:'',set:(o,k,v)=>(o[k]=v,true)})}

const local=storage({gt_remember_login:'1',gt_access_token:'expired',gt_token_expiry:String(Date.now()-86400000),gt_last_email:'fs@example.com'});
const session=storage();
let replaced='';
const location={origin:'https://example.test',pathname:'/app/',hash:'',search:'',hostname:'example.test',replace:url=>{replaced=url}};
const document={visibilityState:'visible',getElementById:()=>element(),querySelector:()=>element(),querySelectorAll:()=>[],addEventListener(){}};
const context={window:null,document,location,history:{state:null,replaceState(){},pushState(){},back(){}},localStorage:local,sessionStorage:session,crypto:webcrypto,URLSearchParams,Intl,Date,console,confirm:()=>false,prompt:()=>null,fetch:async()=>{throw new Error('expired startup must redirect before fetch')},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(){}};
context.window=context;
context.window.GT_CONFIG={googleClientId:'client-id.apps.googleusercontent.com',spreadsheetId:'sheet',masterSheet:'01_リードマスター',activitySheet:'02_活動履歴',settingsSheet:'03_設定',deletionSheet:'05_削除依頼',masterEmail:'master@example.com',refreshSeconds:60};
vm.runInNewContext(fs.readFileSync('app.js','utf8'),context,{filename:'app.js'});

if(!replaced.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'))throw new Error('expired remembered session did not start OAuth');
const params=new URL(replaced).searchParams;
if(params.get('prompt')!=='none')throw new Error('silent OAuth prompt is missing');
if(params.get('login_hint')!=='fs@example.com')throw new Error('last account hint is missing');
if(params.get('response_type')!=='token')throw new Error('unexpected OAuth response type');
if(!session.getItem('gt_oauth_state'))throw new Error('OAuth state was not persisted');
if(session.getItem('gt_oauth_mode')!=='silent')throw new Error('OAuth mode was not marked silent');

const local2=storage({gt_remember_login:'1',gt_last_email:'fs@example.com'});
const session2=storage({gt_oauth_mode:'silent',gt_oauth_state:'state'});
let replaced2='';
const location2={origin:'https://example.test',pathname:'/app/',hash:'#error=login_required&error_description=Login+required',search:'',hostname:'example.test',replace:url=>{replaced2=url}};
const context2={...context,window:null,location:location2,localStorage:local2,sessionStorage:session2,document:{...document,getElementById:()=>element()}};
context2.window=context2;
context2.window.GT_CONFIG=context.window.GT_CONFIG;
vm.runInNewContext(fs.readFileSync('app.js','utf8'),context2,{filename:'app.js'});
if(local2.getItem('gt_remember_login')!=='1')throw new Error('silent OAuth failure forgot the remembered login intent');
if(Number(local2.getItem('gt_silent_retry_after'))<=Date.now())throw new Error('silent OAuth failure did not set a finite retry cooldown');
if(replaced2)throw new Error('silent OAuth failure created a redirect loop');

const local3=storage({gt_last_email:'fs@example.com'});
const session3=storage();
let replaced3='';
const location3={origin:'https://example.test',pathname:'/app/',hash:'',search:'',hostname:'example.test',replace:url=>{replaced3=url}};
const context3={...context,window:null,location:location3,localStorage:local3,sessionStorage:session3,document:{...document,getElementById:()=>element()}};
context3.window=context3;
context3.window.GT_CONFIG=context.window.GT_CONFIG;
vm.runInNewContext(fs.readFileSync('app.js','utf8'),context3,{filename:'app.js'});
context3.beginOAuth(false,'calendar-consent',true);
const calendarParams=new URL(replaced3).searchParams;
if(calendarParams.get('prompt')!=='consent')throw new Error('calendar permission recovery did not force consent');
if(!calendarParams.get('scope').includes('https://www.googleapis.com/auth/calendar.events'))throw new Error('calendar.events scope is missing');

const source=fs.readFileSync('app.js','utf8');
if(source.indexOf('if(!await checkCalendarAccess())')>source.indexOf('await persistPlan(r,plan,btn)'))throw new Error('calendar access is not checked before Sheets persistence');
if(!source.includes('gt_pending_calendar_plan'))throw new Error('pending calendar plan recovery is missing');

console.log(JSON.stringify({passed:true,cases:['expired remembered session -> silent OAuth','silent failure -> preserve login intent without redirect loop','missing Calendar scope -> explicit consent','Calendar permission check -> before Sheets persistence'],loginHint:params.get('login_hint')}));
