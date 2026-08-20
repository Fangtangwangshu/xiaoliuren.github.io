<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>六壬盘</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    background: #1a1f2b;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 100vh; padding: 16px; color: #e2e8f0;
  }
  #dateBar {
    text-align: center; margin-bottom: 10px; line-height: 1.5; width: 100%; max-width: 500px;
  }
  /* 滚动日期：左右箭头 + 中间日期文本 */
  .date-scroll { display: flex; align-items: center; justify-content: center; gap: 10px; }
  .date-arrow {
    width: 34px; height: 34px; border-radius: 50%; background: #334155; color: #e2e8f0;
    border: none; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background .2s; flex: 0 0 auto;
  }
  .date-arrow:active { background: #475569; }
  .date-text { flex: 1; min-width: 0; }
  #dateBar .lunar { font-size: 15px; color: #cbd5e1; letter-spacing: 1px; }
  #dateBar .solar { font-size: 12px; color: #64748b; margin-top: 2px; }
  /* 农历区域中间下方的白色圆形标志 */
  #dateBar .dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #ffffff; margin: 8px auto 0;
    box-shadow: 0 0 6px rgba(255,255,255,0.5);
  }
  #diskCanvas { display: block; touch-action: none; }
  .toolbar { display: flex; gap: 12px; margin-top: 16px; }
  .toolbar button {
    background: #334155; color: #e2e8f0; border: none; padding: 10px 20px; border-radius: 8px;
    font-size: 14px; cursor: pointer; transition: background .2s;
  }
  .toolbar button:active { background: #475569; }
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 99;
  }
  .modal {
    background: #232b38; border-radius: 14px; padding: 22px; width: 86%; max-width: 360px;
    box-shadow: 0 12px 40px rgba(0,0,0,.4);
  }
  .modal h3 { font-size: 16px; margin-bottom: 14px; color: #f1f5f9; text-align: center; }
  .modal input {
    width: 100%; padding: 11px 12px; border-radius: 8px; border: 1px solid #475569;
    background: #1a1f2b; color: #e2e8f0; font-size: 15px; outline: none;
  }
  .modal input:focus { border-color: #3498db; }
  .slice-list { display: flex; flex-direction: column; gap: 8px; max-height: 55vh; overflow-y: auto; }
  .slice-list button {
    background: #2d3748; color: #e2e8f0; border: none; padding: 11px; border-radius: 8px;
    font-size: 14px; cursor: pointer; text-align: left;
  }
  .slice-list button:active { background: #4a5568; }
  .modal-buttons { display: flex; gap: 10px; margin-top: 16px; }
  .btn-cancel, .btn-confirm {
    flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 15px; cursor: pointer;
  }
  .btn-cancel { background: #475569; color: #e2e8f0; }
  .btn-confirm { background: #3498db; color: #fff; }
</style>
</head>
<body>

<div id="dateBar">
  <div class="date-scroll">
    <button class="date-arrow" id="btnPrev" title="前一天">&#10094;</button>
    <div class="date-text">
      <div class="lunar" id="lunarText">—</div>
      <div class="dot" aria-hidden="true"></div>
      <div class="solar" id="solarText"></div>
    </div>
    <button class="date-arrow" id="btnNext" title="后一天">&#10095;</button>
  </div>
</div>

<canvas id="diskCanvas"></canvas>

<div class="toolbar">
  <button id="btnReset">复位</button>
  <button id="btnEdit">编辑文字</button>
</div>

<!-- 农历计算：CDN lunar-javascript（在线时准确优先）；离线时由内嵌查表模块降级 -->
<script src="https://cdn.jsdelivr.net/npm/lunar-javascript@1.6.19/lunar.min.js"></script>
<script>
// ============================================================
//  六壬盘 - 三层同心圆盘 (Canvas)
//  正上方显示农历日期（可左右滚动查询多日）
//  圆盘外正上方有一颗红色圆形标记
// ============================================================

const SLICE_COUNT = 6;
const SLICE_ANGLE = (Math.PI * 2) / SLICE_COUNT;

// 三层颜色 内→外
const COLORS = ['#E74C3C','#F39C12','#3498DB'];
const DARK_TEXT_LAYERS = [1];

const DEFAULT_TEXTS = [
  ["大安","留连","速喜","赤口","小吉","空亡"],
  ["大安","留连","速喜","赤口","小吉","空亡"],
  ["大安","留连","速喜","赤口","小吉","空亡"],
];

const STORAGE_KEY = 'liuren_disk_config_v3';
const DATE_SESSION_KEY = 'liuren_date_session_v3'; // sessionStorage 标记

// ==================== 全局状态 ====================
let canvas, ctx;
let cssSize = 400, centerX, centerY, dpr = 1;
let rotations = [0,0,0];
let texts = DEFAULT_TEXTS.map(row => [...row]);
let dragging=false, dragLayer=-1, lastAngle=0, dragStartRot=0;
let lastTapTime=0, lastTapLayer=-1;

// 当前查看的日期（可滚动）；默认今天，由会话初始化逻辑决定
let currentDate = new Date();

const MARK_RADIUS = 7, MARK_GAP = 10;

// ==================== 农历计算 ====================
// 自实现离线降级：基于权威源逐月核对得到的"农历每月初一公历日期"查表（2024-2028）
const LUNAR_FIRST_TABLE = {
  "2024-1":[2024,2,10],"2024-2":[2024,3,10],"2024-3":[2024,4,9],"2024-4":[2024,5,8],
  "2024-5":[2024,6,6],"2024-6":[2024,7,6],"2024-7":[2024,8,4],"2024-8":[2024,9,3],
  "2024-9":[2024,10,3],"2024-10":[2024,11,1],"2024-11":[2024,12,1],"2024-12":[2024,12,31],
  "2025-1":[2025,1,29],"2025-2":[2025,2,28],"2025-3":[2025,3,29],"2025-4":[2025,4,28],
  "2025-5":[2025,5,27],"2025-6":[2025,6,25],"2025-闰6":[2025,7,25],"2025-7":[2025,8,23],
  "2025-8":[2025,9,22],"2025-9":[2025,10,21],"2025-10":[2025,11,20],"2025-11":[2025,12,20],
  "2025-12":[2026,1,19],
  "2026-1":[2026,2,17],"2026-2":[2026,3,19],"2026-3":[2026,4,17],"2026-4":[2026,5,17],
  "2026-5":[2026,6,15],"2026-6":[2026,7,14],"2026-7":[2026,8,13],"2026-8":[2026,9,11],
  "2026-9":[2026,10,10],"2026-10":[2026,11,9],"2026-11":[2026,12,9],"2026-12":[2027,1,8],
  "2027-1":[2027,2,6],"2027-2":[2027,3,8],"2027-3":[2027,4,7],"2027-4":[2027,5,6],
  "2027-5":[2027,6,5],"2027-6":[2027,7,4],"2027-7":[2027,8,2],"2027-8":[2027,9,1],
  "2027-9":[2027,9,30],"2027-10":[2027,10,29],"2027-11":[2027,11,28],"2027-12":[2027,12,28],
  "2028-1":[2028,1,26],"2028-2":[2028,2,25],"2028-3":[2028,3,26],"2028-4":[2028,4,25],
  "2028-5":[2028,5,24],"2028-闰5":[2028,6,23],"2028-6":[2028,7,22],"2028-7":[2028,8,20],
  "2028-8":[2028,9,19],"2028-9":[2028,10,18],"2028-10":[2028,11,16],"2028-11":[2028,12,16]
};
const SHENGXIAO=["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"];
const MONTH_CN=["正","二","三","四","五","六","七","八","九","十","冬","腊"];
const DAY_CN=["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十",
  "十一","十二","十三","十四","十五","十六","十七","十八","十九","二十",
  "廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];

// 查表法：由"农历每月初一公历日期"反推农历（2024-2028，覆盖主要使用区间）
function lunarFromTableExact(d){
  const y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate();
  const keys=Object.keys(LUNAR_FIRST_TABLE).sort((a,b)=>{
    const av=LUNAR_FIRST_TABLE[a],bv=LUNAR_FIRST_TABLE[b];
    return av[0]-bv[0]||av[1]-bv[1]||av[2]-bv[2];
  });
  let chosen=null;
  for(const k of keys){
    const [fy,fm,fd]=LUNAR_FIRST_TABLE[k];
    if(d>=new Date(fy,fm-1,fd)) chosen=k; else break;
  }
  if(!chosen) return null;
  const [fy,fm,fd]=LUNAR_FIRST_TABLE[chosen];
  const fdt=new Date(fy,fm-1,fd);
  const diff=Math.floor((Date.UTC(y,m-1,day)-Date.UTC(fdt.getFullYear(),fdt.getMonth(),fdt.getDate()))/86400000);
  const monthNum=parseInt(chosen.replace("闰","").split("-")[1],10);
  const isLeap=chosen.indexOf("闰")>=0;
  return {year:fy,month:monthNum,day:diff+1,isLeap};
}

// 统一入口：CDN 可用则用 lunar-javascript（最准确），否则降级查表
function getLunarResult(d){
  try{
    if(window.Lunar && typeof window.Lunar.fromDate==="function"){
      const l=window.Lunar.fromDate(new Date(d));
      return { year:l.getYear(), month:l.getMonth(), day:l.getDay(), isLeap:!!l.getLeap() };
    }
  }catch(e){}
  return lunarFromTableExact(d);
}
function lunarToText(d){
  const l=getLunarResult(d);
  if(!l) return { line1:"农历数据暂不可用", line2:"" };
  const sx=SHENGXIAO[(l.year-4)%12];
  const m=(l.isLeap?"闰":"")+MONTH_CN[l.month-1]+"月";
  const day=DAY_CN[l.day-1]||(""+l.day);
  return { line1:`${l.year}年(${sx}年)`, line2:`${m}${day}` };
}

// ==================== 日期状态管理 ====================
// 规则：
//  - 完全退出(sessionStorage 清空)后重新进入 → 重置 currentDate 为今天，并标记本会话已初始化
//  - 同一次会话内切换日期 → 保持用户当前浏览的日期（写入 localStorage 仅用于跨标签观察，不作为"回到今天"依据）
//  - 每次 init 时若检测到"今天"相对于上次会话已变化（跨天重开），同样重置为今天
function initDateState(){
  const todayKey = new Date().toDateString();
  const sessionMark = sessionStorage.getItem(DATE_SESSION_KEY);
  // 全新会话（sessionStorage 无标记）→ 重置为今天
  if(sessionMark !== "init"){
    currentDate = new Date();
    sessionStorage.setItem(DATE_SESSION_KEY, "init");
    return;
  }
  // 同会话：尝试恢复上次浏览的日期（仅同会话内的 localStorage 记忆）
  try{
    const saved=localStorage.getItem(STORAGE_KEY+"_date");
    if(saved){ const t=new Date(saved); if(!isNaN(t)) currentDate=t; }
  }catch(e){}
}
function saveDateState(){
  try{ localStorage.setItem(STORAGE_KEY+"_date", currentDate.toISOString()); }catch(e){}
}
function shiftDate(delta){
  currentDate.setDate(currentDate.getDate()+delta);
  saveDateState();
  updateDate();
}

function updateDate(){
  const d=currentDate;
  const lunar=lunarToText(d);
  document.getElementById("lunarText").textContent=`${lunar.line1} ${lunar.line2}`;
  const w=["日","一","二","三","四","五","六"][d.getDay()];
  document.getElementById("solarText").textContent=
    `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${w}`;
}

// ==================== 初始化 ====================
function init(){
  canvas=document.getElementById("diskCanvas");
  ctx=canvas.getContext("2d");
  dpr=window.devicePixelRatio||1;
  resizeCanvas();
  window.addEventListener("resize",resizeCanvas);
  window.addEventListener("orientationchange",()=>setTimeout(resizeCanvas,300));
  loadConfig();
  bindEvents();
  initDateState();
  draw();
  updateDate();
}

function resizeCanvas(){
  const margin=24, btnSpace=110;
  const w=window.innerWidth, h=window.innerHeight;
  const available=Math.min(w,h-btnSpace)-margin*2;
  cssSize=Math.max(280,Math.min(available,500));
  canvas.style.width=cssSize+"px";
  canvas.style.height=cssSize+"px";
  canvas.width=Math.round(cssSize*dpr);
  canvas.height=Math.round(cssSize*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  centerX=cssSize/2; centerY=cssSize/2;
  draw();
}

// ==================== 半径计算 (三层) ====================
function calcRadii(){
  const maxR=cssSize/2-2, gap=1.5, totalGap=gap*3;
  const thickness=(maxR-totalGap)/3;
  const radii=[];
  for(let i=0;i<3;i++) radii.push([i*(thickness+gap), i*(thickness+gap)+thickness]);
  return radii;
}

// ==================== 绘制 ====================
function draw(){
  ctx.clearRect(0,0,cssSize,cssSize);
  const radii=calcRadii();
  for(let li=2;li>=0;li--) drawLayer(li,radii[li]);
  drawCenterCircle(radii[0][0]);
  drawOuterMark(radii);
}

function drawLayer(layerIdx,radii){
  const [rIn,rOut]=radii, rot=rotations[layerIdx], color=COLORS[layerIdx];
  for(let si=0;si<SLICE_COUNT;si++){
    const start=rot+si*SLICE_ANGLE-Math.PI/2;
    const end=rot+(si+1)*SLICE_ANGLE-Math.PI/2;
    ctx.beginPath();
    if(rIn===0){ ctx.moveTo(centerX,centerY); ctx.arc(centerX,centerY,rOut,start,end); }
    else { ctx.arc(centerX,centerY,rOut,start,end); ctx.arc(centerX,centerY,rIn,end,start,true); }
    ctx.closePath();
    ctx.fillStyle=color; ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.9)"; ctx.lineWidth=1.0; ctx.stroke();
    drawSliceText(layerIdx,si,start,end,rIn,rOut);
  }
  if(rIn>0){ ctx.beginPath(); ctx.arc(centerX,centerY,rIn,0,Math.PI*2);
    ctx.strokeStyle="rgba(255,255,255,0.5)"; ctx.lineWidth=0.8; ctx.stroke(); }
}

function drawSliceText(layerIdx,sliceIdx,angleStart,angleEnd,rIn,rOut){
  const midAngle=(angleStart+angleEnd)/2, rMid=(rIn+rOut)/2;
  const tx=centerX+rMid*Math.cos(midAngle), ty=centerY+rMid*Math.sin(midAngle);
  const fontSize=Math.max(8,Math.min(15,(rOut-rIn)*0.36));
  ctx.fillStyle=DARK_TEXT_LAYERS.includes(layerIdx)?"#2c2c2c":"#FFFFFF";
  ctx.font=`${fontSize}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign="center"; ctx.textBaseline="middle";
  const txt=texts[layerIdx][sliceIdx];
  const lines=txt.split("|");
  if(lines.length===1){ ctx.fillText(txt,tx,ty); }
  else{ const lh=fontSize*1.15, startY=ty-(lines.length-1)*lh/2;
    lines.forEach((line,i)=>ctx.fillText(line,tx,startY+i*lh)); }
}

function drawCenterCircle(r){
  ctx.beginPath(); ctx.arc(centerX,centerY,r,0,Math.PI*2);
  ctx.fillStyle="#37434B"; ctx.fill();
  ctx.strokeStyle="#64748B"; ctx.lineWidth=1.5; ctx.stroke();
  const fontSize=Math.max(8,r*0.45);
  ctx.fillStyle="#A0AAB9";
  ctx.font=`${fontSize}px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif`;
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("壬",centerX,centerY);
}

function drawOuterMark(radii){
  const rOut=radii[2][1];
  const cx=centerX;
  const cy=centerY-rOut-MARK_GAP-MARK_RADIUS;
  ctx.beginPath();
  ctx.moveTo(centerX,centerY-rOut);
  ctx.lineTo(cx,cy+MARK_RADIUS);
  ctx.strokeStyle="rgba(231,76,60,0.35)"; ctx.lineWidth=1.2; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,MARK_RADIUS,0,Math.PI*2);
  ctx.fillStyle="#E74C3C"; ctx.fill();
  ctx.strokeStyle="#ff7a6b"; ctx.lineWidth=1; ctx.stroke();
}

// ==================== 交互 ====================
function getCanvasPos(clientX,clientY){const r=canvas.getBoundingClientRect();return{x:clientX-r.left,y:clientY-r.top};}
function getAngle(x,y){return Math.atan2(y-centerY,x-centerX);}
function posToLayer(x,y){const d=Math.hypot(x-centerX,y-centerY),r=calcRadii();for(let i=2;i>=0;i--)if(d>=r[i][0]&&d<=r[i][1])return i;return -1;}
function angleToSlice(layerIdx,angle){let a=(angle-rotations[layerIdx]-Math.PI/2)%(Math.PI*2);if(a<0)a+=Math.PI*2;return Math.floor(a/SLICE_ANGLE)%SLICE_COUNT;}

function bindEvents(){
  canvas.addEventListener("mousedown",onDown);
  window.addEventListener("mousemove",onMove);
  window.addEventListener("mouseup",onUp);
  canvas.addEventListener("touchstart",e=>{e.preventDefault();onDown(e);},{passive:false});
  canvas.addEventListener("touchmove",e=>{e.preventDefault();onMove(e);},{passive:false});
  canvas.addEventListener("touchend",e=>{e.preventDefault();onUp(e);},{passive:false});
  document.getElementById("btnReset").addEventListener("click",()=>{rotations=[0,0,0];saveConfig();draw();});
  document.getElementById("btnEdit").addEventListener("click",showLayerPicker);
  document.getElementById("btnPrev").addEventListener("click",()=>shiftDate(-1));
  document.getElementById("btnNext").addEventListener("click",()=>shiftDate(1));
}

function onDown(e){const t=e.touches?e.touches[0]:e;const p=getCanvasPos(t.clientX,t.clientY);const ly=posToLayer(p.x,p.y);if(ly>=0){dragging=true;dragLayer=ly;lastAngle=getAngle(p.x,p.y);dragStartRot=rotations[ly];}}
function onMove(e){if(!dragging)return;const t=e.touches?e.touches[0]:e;const p=getCanvasPos(t.clientX,t.clientY);const cur=getAngle(p.x,p.y);let d=cur-lastAngle;if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;rotations[dragLayer]+=d;lastAngle=cur;draw();}
function onUp(e){if(!dragging)return;const changed=Math.abs(rotations[dragLayer]-dragStartRot)%(Math.PI*2);const t=e.changedTouches?e.changedTouches[0]:e;const p=getCanvasPos(t.clientX,t.clientY);if(changed<0.05){const now=Date.now();if(now-lastTapTime<300&&lastTapLayer===dragLayer){showEditDialog(dragLayer,angleToSlice(dragLayer,getAngle(p.x,p.y)));lastTapTime=0;}else{lastTapTime=now;lastTapLayer=dragLayer;}}dragging=false;dragLayer=-1;saveConfig();}

// ==================== 弹窗 ====================
function closeAllModals(){document.querySelectorAll(".modal-overlay").forEach(el=>el.remove());}
function showEditDialog(layerIdx,sliceIdx){closeAllModals();const o=document.createElement("div");o.className="modal-overlay";o.innerHTML=`<div class="modal"><h3>编辑 L${layerIdx+1}层 · 扇区${sliceIdx+1}</h3><input type="text" id="editInput" value="${texts[layerIdx][sliceIdx]}" placeholder="用|换行"><div class="modal-buttons"><button class="btn-cancel" id="btnCancel">取消</button><button class="btn-confirm" id="btnSave">确定</button></div></div>`;document.body.appendChild(o);const inp=document.getElementById("editInput");inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);document.getElementById("btnSave").onclick=()=>{texts[layerIdx][sliceIdx]=inp.value.trim()||"空";saveConfig();draw();o.remove();};document.getElementById("btnCancel").onclick=()=>o.remove();inp.addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("btnSave").click();if(e.key==="Escape")o.remove();});}
function showLayerPicker(){closeAllModals();const o=document.createElement("div");o.className="modal-overlay";const names=["红(L1)","橙(L2)","蓝(L3)"];let b="";for(let i=0;i<3;i++)b+=`<button onclick="showSlicePicker(${i})">第${i+1}层 - ${names[i]}</button>`;o.innerHTML=`<div class="modal"><h3>选择要编辑的层</h3><div class="slice-list">${b}</div><button class="btn-cancel" style="width:100%;margin-top:12px" onclick="this.closest('.modal-overlay').remove()">关闭</button></div>`;document.body.appendChild(o);}
function showSlicePicker(layerIdx){closeAllModals();const o=document.createElement("div");o.className="modal-overlay";let b="";for(let i=0;i<6;i++)b+=`<button onclick="showEditDialog(${layerIdx},${i})">扇区${i+1}：${texts[layerIdx][i]}</button>`;o.innerHTML=`<div class="modal"><h3>L${layerIdx+1}层 - 选择扇区</h3><div class="slice-list">${b}</div><button class="btn-cancel" style="width:100%;margin-top:12px" onclick="this.closest('.modal-overlay').remove()">返回</button></div>`;document.body.appendChild(o);}

// ==================== 存储 ====================
function loadConfig(){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const d=JSON.parse(raw);if(d.texts)texts=d.texts;if(d.rotations)rotations=d.rotations;}}catch(e){}}
function saveConfig(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({texts,rotations}));}catch(e){}}

init();
</script>
</body>
</html>
