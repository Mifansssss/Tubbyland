import { useState, useEffect, useRef, useCallback } from "react";

const SUPABASE_URL = "https://qvrvsftkuhxpsigzbmda.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2cnZzZnRrdWh4cHNpZ3pibWRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjM0ODAsImV4cCI6MjA4ODMzOTQ4MH0.iGNeV_Y2U54rqARcXzBlZX0c-E4-nCVFs8Pc9Pwib3M";
const HEADERS = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Prefer": "resolution=merge-duplicates" };

async function dbGet(key) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tubbyland_data?key=eq.${key}&select=value`, { headers: HEADERS });
    const rows = await r.json();
    return rows?.[0]?.value ?? null;
  } catch { return null; }
}

async function dbSet(key, value) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/tubbyland_data`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
    });
  } catch {}
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CAT_KEYS = ["utilities","groceries","dining","entertainment","tubby","others"];
const CATEGORY_COLORS = { utilities:"#F4A261", groceries:"#2A9D8F", dining:"#E76F51", entertainment:"#9B8EC4", tubby:"#F28B82", others:"#A8DADC", rent:"#8B8FA8" };
const CAT_ICONS = { utilities:"⚡", groceries:"🛒", dining:"🍜", entertainment:"🎬", tubby:"🐾", others:"📦", rent:"🏠" };
const CAT_LABELS = { utilities:"Utilities", groceries:"Groceries", dining:"Dining Out", entertainment:"Entertainment", tubby:"Tubby 🐶", others:"Others", rent:"Rent" };
const ALL_CATS = ["rent",...CAT_KEYS];

const DEFAULT_SETTINGS = { rent:0, contribMe:0, contribSister:0, budget:{ utilities:0, groceries:0, dining:0, entertainment:0, tubby:0, others:0 } };

const initMonth = (s) => ({
  contributions:{ me:s?.contribMe??0, sister:s?.contribSister??0 },
  startingBalance:0, startingBalanceManual:false,
  expenses:{ rent:s?.rent??DEFAULT_SETTINGS.rent, utilities:0, groceries:0, dining:0, entertainment:0, tubby:0, others:0 },
  budget:{...(s?.budget??DEFAULT_SETTINGS.budget)},
  comment:"", transactions:[],
});

const getPrevKey = (y,m) => m===0?[y-1,11]:[y,m-1];
const genId = () => Math.random().toString(36).slice(2,9);

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIdx, setMonthIdx] = useState(today.getMonth());
  const [data, setData] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState("overview");
  const [showSettings, setShowSettings] = useState(false);
  const loaded = useRef(false);

  // New transaction form state
  const [txAmount, setTxAmount] = useState("");
  const [txCat, setTxCat] = useState("groceries");
  const [txNote, setTxNote] = useState("");
  const [txDate, setTxDate] = useState(today.toISOString().slice(0,10));
  const [txPaidBy, setTxPaidBy] = useState("shared");

  useEffect(() => {
    (async () => {
      try {
        const [r, s] = await Promise.all([dbGet("expense-data-v3"), dbGet("expense-settings")]);
        if (s) setSettings(JSON.parse(s));
        if (r) setData(JSON.parse(r));
      } catch {}
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    dbSet("expense-data-v3", JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (!loaded.current) return;
    dbSet("expense-settings", JSON.stringify(settings));
  }, [settings]);

  const calcEndBal = (y,m,d) => {
    const md=d[y]?.[m]; if(!md) return 0;
    const tIn=(md.contributions.me||0)+(md.contributions.sister||0);
    const tOut=Object.values(md.expenses||{}).reduce((a,b)=>a+(b||0),0);
    return (md.startingBalance||0)+tIn-tOut;
  };

  const ensureMonth = (y,m,d,s) => {
    if(d[y]?.[m]) return d;
    const nm=initMonth(s);
    const [py,pm]=getPrevKey(y,m);
    if(d[py]?.[pm]!==undefined) nm.startingBalance=calcEndBal(py,pm,d);
    return {...d,[y]:{...(d[y]||{}),[m]:nm}};
  };

  useEffect(()=>{
    if(!loaded.current) return;
    setData(d=>ensureMonth(year,monthIdx,d,settings));
  },[year,monthIdx,loaded.current]);

  const month = data[year]?.[monthIdx]??initMonth(settings);
  const transactions = month.transactions||[];
  const totalIn=(month.contributions.me||0)+(month.contributions.sister||0);
  const totalOut=Object.values(month.expenses||{}).reduce((a,b)=>a+(b||0),0);
  const startBal=month.startingBalance||0;
  const endBal=startBal+totalIn-totalOut;
  const nonRentOut=totalOut-(month.expenses.rent||0);
  const totalBudget=Object.values(month.budget||{}).reduce((a,b)=>a+(b||0),0);
  const netChange=totalBudget-nonRentOut;

  // YTD calculations across all months in current year
  const ytdMe = MONTHS.reduce((sum,_,m)=>{ const md=data[year]?.[m]; return sum+(md?.contributions.me||0); },0);
  const ytdSister = MONTHS.reduce((sum,_,m)=>{ const md=data[year]?.[m]; return sum+(md?.contributions.sister||0); },0);
  const ytdOut = MONTHS.reduce((sum,_,m)=>{ const md=data[year]?.[m]; return sum+Object.values(md?.expenses||{}).reduce((a,b)=>a+(b||0),0); },0);

  const updateField = (path,value) => {
    setData(d=>{
      const copy=JSON.parse(JSON.stringify(d));
      if(!copy[year]) copy[year]={};
      if(!copy[year][monthIdx]) copy[year][monthIdx]=initMonth(settings);
      const keys=path.split(".");
      let ref=copy[year][monthIdx];
      for(let i=0;i<keys.length-1;i++) ref=ref[keys[i]];
      ref[keys[keys.length-1]]=value;
      return copy;
    });
  };

  const navigateMonth = (dir) => {
    let ny=year, nm=monthIdx+dir;
    if(nm<0){ny--;nm=11;} if(nm>11){ny++;nm=0;}
    setData(d=>{
      let copy=JSON.parse(JSON.stringify(d));
      if(!copy[ny]?.[nm]) copy=ensureMonth(ny,nm,copy,settings);
      else if(!copy[ny][nm].startingBalanceManual&&dir===1) copy[ny][nm].startingBalance=calcEndBal(year,monthIdx,copy);
      return copy;
    });
    setYear(ny); setMonthIdx(nm);
  };

  // Add transaction and update category expense total
  const addTransaction = () => {
    const amt = parseFloat(txAmount);
    if(!amt||amt<=0) return;
    const tx = { id:genId(), amount:amt, category:txCat, note:txNote.trim(), date:txDate, paidBy:txPaidBy };
    setData(d=>{
      const copy=JSON.parse(JSON.stringify(d));
      if(!copy[year]) copy[year]={};
      if(!copy[year][monthIdx]) copy[year][monthIdx]=initMonth(settings);
      const m=copy[year][monthIdx];
      m.transactions=[...(m.transactions||[]),tx];
      // Recalculate category total from transactions (non-rent)
      if(CAT_KEYS.includes(txCat)){
        m.expenses[txCat]=m.transactions.filter(t=>t.category===txCat).reduce((s,t)=>s+t.amount,0);
      }
      return copy;
    });
    setTxAmount(""); setTxNote("");
  };

  const deleteTransaction = (id) => {
    setData(d=>{
      const copy=JSON.parse(JSON.stringify(d));
      const m=copy[year][monthIdx];
      m.transactions=(m.transactions||[]).filter(t=>t.id!==id);
      // Recalculate all cat totals from remaining transactions
      CAT_KEYS.forEach(cat=>{
        const catTxs=m.transactions.filter(t=>t.category===cat);
        if(catTxs.length>0) m.expenses[cat]=catTxs.reduce((s,t)=>s+t.amount,0);
        else m.expenses[cat]=0;
      });
      return copy;
    });
  };

  const num=(v)=>parseFloat(v)||0;
  const fmt=(v)=>v<0?`-$${Math.abs(v).toFixed(2)}`:`$${Number(v).toFixed(2)}`;
  const fmtK=(v)=>v<0?`-$${Math.abs(v).toFixed(0)}`:`$${Number(v).toFixed(0)}`;

  const getHistory=(n)=>{
    const result=[];
    let y=year,m=monthIdx;
    for(let i=0;i<n;i++){
      const md=data[y]?.[m];
      if(md){
        const tIn=(md.contributions.me||0)+(md.contributions.sister||0);
        const tOut=Object.values(md.expenses||{}).reduce((a,b)=>a+(b||0),0);
        result.unshift({label:MONTHS[m].slice(0,3),year:y,month:m,totalIn:tIn,totalOut:tOut,endBal:(md.startingBalance||0)+tIn-tOut,expenses:{...md.expenses},contributions:{...md.contributions}});
      }
      m--; if(m<0){m=11;y--;}
    }
    return result;
  };
  const history=getHistory(6);

  const LineChart=({data:pts,color,height=80})=>{
    if(pts.length<2) return <div style={{color:"#9EA8BF",fontSize:11,textAlign:"center",paddingTop:30}}>Not enough data yet</div>;
    const vals=pts.map(p=>p.value);
    const min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
    const px=(i)=>(i/(pts.length-1))*100;
    const py=(v)=>height-((v-min)/range)*(height-10)-5;
    const pathD=pts.map((p,i)=>`${i===0?"M":"L"}${px(i)},${py(p.value)}`).join(" ");
    return(
      <svg viewBox={`0 0 100 ${height}`} style={{width:"100%",height}} preserveAspectRatio="none">
        <defs><linearGradient id={`g${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
        <path d={`${pathD} L${px(pts.length-1)},${height} L0,${height} Z`} fill={`url(#g${color.replace("#","")})`}/>
        <path d={pathD} stroke={color} strokeWidth="1.5" fill="none"/>
        {pts.map((p,i)=><circle key={i} cx={px(i)} cy={py(p.value)} r="2.5" fill={color}/>)}
      </svg>
    );
  };

  const BarChart=({cats,months})=>{
    const maxV=Math.max(...months.flatMap(m=>cats.map(c=>m.expenses[c]||0)),1);
    const bW=100/(months.length*cats.length+months.length);
    return(
      <svg viewBox="0 0 100 60" style={{width:"100%",height:100}} preserveAspectRatio="none">
        {months.map((m,mi)=>cats.map((cat,ci)=>{
          const val=m.expenses[cat]||0,bH=(val/maxV)*55,x=(mi*(cats.length+1)+ci)*bW+bW*0.1;
          return <rect key={`${mi}-${ci}`} x={x} y={60-bH} width={bW*0.9} height={bH} fill={CATEGORY_COLORS[cat]} opacity="0.85" rx="0.4"/>;
        }))}
      </svg>
    );
  };

  const TABS = ["overview","contributions","expenses","transactions","budget & notes","analysis"];

  return(
    <div style={{minHeight:"100vh",background:"#F4F6FB",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",color:"#1A1D23"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=Playfair+Display:wght@700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        input[type=number],input[type=text],input[type=date],textarea,select{background:transparent;border:none;border-bottom:1.5px solid #DDE2EC;color:#1A1D23;font-family:'DM Sans',sans-serif;font-size:13px;padding:6px 0;width:100%;outline:none;}
        input[type=number]:focus,input[type=text]:focus,input[type=date]:focus,textarea:focus,select:focus{border-bottom-color:#5B6AF0;}
        select option{background:#fff;color:#1A1D23;}
        textarea{resize:vertical;min-height:80px;line-height:1.7;}
        .tab-btn{background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;letter-spacing:0.03em;padding:11px 14px;color:#9EA8BF;transition:all 0.18s;text-transform:uppercase;white-space:nowrap;}
        .tab-btn.active{color:#5B6AF0;border-bottom:2.5px solid #5B6AF0;}
        .tab-btn:hover{color:#1A1D23;}
        .card{background:#fff;border:1px solid #E6EAF4;border-radius:12px;padding:20px;box-shadow:0 1px 4px rgba(30,40,80,0.05);}
        .label{font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#9EA8BF;margin-bottom:5px;font-weight:600;}
        .row-item{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F2F4FA;}
        .row-item:last-child{border-bottom:none;}
        .nav-btn{background:#fff;border:1.5px solid #E6EAF4;color:#6B7490;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;padding:6px 14px;cursor:pointer;border-radius:8px;transition:all 0.15s;box-shadow:0 1px 3px rgba(30,40,80,0.05);}
        .nav-btn:hover{border-color:#5B6AF0;color:#5B6AF0;background:#F0F2FF;}
        .progress-bar{height:7px;background:#F0F2FA;border-radius:4px;overflow:hidden;margin-top:7px;}
        .progress-fill{height:100%;border-radius:4px;transition:width 0.5s ease;}
        .modal-bg{position:fixed;inset:0;background:rgba(15,20,50,0.4);z-index:100;display:flex;align-items:center;justify-content:center;}
        .modal{background:#fff;border:1px solid #E6EAF4;padding:28px;border-radius:16px;min-width:300px;max-width:92vw;box-shadow:0 8px 32px rgba(30,40,80,0.13);}
        .tx-row{display:grid;grid-template-columns:60px 1fr 80px 60px 28px;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #F2F4FA;font-size:12px;}
        .del-btn{background:none;border:none;color:#C8D0E0;cursor:pointer;font-size:17px;padding:0;transition:color 0.15s;}
        .del-btn:hover{color:#EF4444;}
        .add-btn{background:#5B6AF0;color:#fff;border:none;padding:10px 24px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;border-radius:9px;letter-spacing:0.02em;transition:all 0.15s;white-space:nowrap;box-shadow:0 2px 8px rgba(91,106,240,0.22);}
        .add-btn:hover{background:#4A59E0;box-shadow:0 4px 14px rgba(91,106,240,0.35);}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#F4F6FB;}::-webkit-scrollbar-thumb{background:#DDE2EC;border-radius:4px;}
      `}</style>

      {/* Settings Modal */}
      {showSettings&&(
        <div className="modal-bg" onClick={()=>setShowSettings(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,marginBottom:22}}>⚙ Default Settings</div>
            <div style={{marginBottom:6,padding:"12px 14px",background:"#F4F6FB",borderRadius:10,border:"1px solid #E6EAF4"}}>
              <div style={{fontSize:11,color:"#9EA8BF",marginBottom:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase"}}>Fixed Monthly (auto-fills new months)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
                <div>
                  <div className="label">🏠 Rent</div>
                  <input type="number" placeholder="0" value={settings.rent||""} onChange={e=>setSettings(s=>({...s,rent:num(e.target.value)}))}/>
                </div>
                <div>
                  <div className="label">👤 My Contrib</div>
                  <input type="number" placeholder="0" value={settings.contribMe||""} onChange={e=>setSettings(s=>({...s,contribMe:num(e.target.value)}))}/>
                </div>
                <div>
                  <div className="label">👤 Sister</div>
                  <input type="number" placeholder="0" value={settings.contribSister||""} onChange={e=>setSettings(s=>({...s,contribSister:num(e.target.value)}))}/>
                </div>
              </div>
              {(settings.contribMe||0)+(settings.contribSister||0) > 0 && (
                <div style={{marginTop:10,fontSize:11,color:(settings.contribMe||0)+(settings.contribSister||0)>=(settings.rent||0)?"#2A9D8F":"#E76F51",fontWeight:500}}>
                  Monthly net: {(settings.contribMe||0)+(settings.contribSister||0)>=(settings.rent||0)?"✓ ":"⚠ "}
                  ${((settings.contribMe||0)+(settings.contribSister||0)-(settings.rent||0)).toFixed(0)} after rent
                </div>
              )}
            </div>
            <div className="label" style={{marginBottom:10,marginTop:16}}>Default Variable Budgets</div>
            {CAT_KEYS.map(k=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:12}}>{CAT_ICONS[k]} {CAT_LABELS[k]}</span>
                <div style={{width:110}}><input type="number" value={settings.budget[k]||""} onChange={e=>setSettings(s=>({...s,budget:{...s.budget,[k]:num(e.target.value)}}))} /></div>
              </div>
            ))}
            <div style={{marginTop:14,fontSize:11,color:"#9EA8BF",lineHeight:1.6}}>Applies to new months only. Existing months are not affected.</div>
            <button className="add-btn" style={{marginTop:18,width:"100%",justifyContent:"center"}} onClick={()=>setShowSettings(false)}>Done ✓</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{background:"#fff",borderBottom:"1px solid #E6EAF4",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:900}}>Tubbyland</div>
          <div style={{fontSize:9,letterSpacing:"0.2em",color:"#9EA8BF",marginTop:1,textTransform:"uppercase"}}>Joint Account Tracker</div>
        </div>

        {/* YTD mini strip */}
        <div style={{display:"flex",gap:16,padding:"6px 14px",background:"#F0F2FA",border:"1px solid #E6EAF4",borderRadius:80}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"#9EA8BF",letterSpacing:"0.12em",textTransform:"uppercase"}}>YTD Me</div>
            <div style={{fontSize:13,color:"#2A9D8F",fontWeight:500}}>{fmtK(ytdMe)}</div>
          </div>
          <div style={{width:1,background:"#F0F2FA"}}/>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"#9EA8BF",letterSpacing:"0.12em",textTransform:"uppercase"}}>YTD Sister</div>
            <div style={{fontSize:13,color:"#A8DADC",fontWeight:500}}>{fmtK(ytdSister)}</div>
          </div>
          <div style={{width:1,background:"#F0F2FA"}}/>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"#9EA8BF",letterSpacing:"0.12em",textTransform:"uppercase"}}>YTD Spent</div>
            <div style={{fontSize:13,color:"#E76F51",fontWeight:500}}>{fmtK(ytdOut)}</div>
          </div>
          <div style={{width:1,background:"#F0F2FA"}}/>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"#9EA8BF",letterSpacing:"0.12em",textTransform:"uppercase"}}>{year}</div>
            <div style={{fontSize:13,color:"#6B7490",fontWeight:500}}>{fmtK(ytdMe+ytdSister-ytdOut)} left</div>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="nav-btn" onClick={()=>navigateMonth(-1)}>← prev</button>
          <div style={{textAlign:"center",minWidth:96}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700}}>{MONTHS[monthIdx]}</div>
            <div style={{fontSize:10,color:"#9EA8BF"}}>{year}</div>
          </div>
          <button className="nav-btn" onClick={()=>navigateMonth(1)}>next →</button>
          <button className="nav-btn" style={{marginLeft:4,fontSize:11}} onClick={()=>setShowSettings(true)}>⚙</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:"1px solid #E6EAF4",paddingLeft:16,background:"#fff",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t} className={`tab-btn${activeTab===t?" active":""}`} onClick={()=>setActiveTab(t)}>{t}</button>
        ))}
      </div>

      <div style={{padding:"18px 18px",maxWidth:860,margin:"0 auto"}}>

        {/* OVERVIEW */}
        {activeTab==="overview"&&(
          <div style={{display:"grid",gap:14}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
              {[
                {label:"Starting Balance",value:fmtK(startBal),color:"#6B7490"},
                {label:"Total In",value:fmtK(totalIn),color:"#2A9D8F"},
                {label:"Total Out",value:fmtK(totalOut),color:"#E76F51"},
                {label:"Ending Balance",value:fmtK(endBal),color:endBal>=0?"#2A9D8F":"#E76F51"},
              ].map(c=>(
                <div key={c.label} className="card" style={{borderTop:`2px solid ${c.color}`}}>
                  <div className="label">{c.label}</div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:c.color}}>{c.value}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="label" style={{marginBottom:12}}>Contributions Split</div>
              <div style={{display:"flex",gap:18,alignItems:"center"}}>
                <div style={{flex:1}}>
                  {[{k:"me",label:"Ruth's",color:"#2A9D8F"},{k:"sister",label:"Lois's",color:"#A8DADC"}].map(r=>(
                    <div key={r.k} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:12}}>{r.label}</span>
                      <span style={{color:r.color}}>{fmtK(month.contributions[r.k]||0)}</span>
                    </div>
                  ))}
                  <div style={{height:1,background:"#EEF0F8",margin:"7px 0"}}/>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:11,color:"#9EA8BF"}}>Total</span><span>{fmtK(totalIn)}</span>
                  </div>
                </div>
                <div style={{flex:1}}>
                  <div style={{height:7,background:"#EEF0F8",borderRadius:4,overflow:"hidden",display:"flex"}}>
                    <div style={{width:`${totalIn>0?(month.contributions.me/totalIn*100):50}%`,background:"#2A9D8F",transition:"width 0.5s"}}/>
                    <div style={{flex:1,background:"#A8DADC"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:10,color:"#9EA8BF"}}>
                    <span>Ruth's {totalIn>0?Math.round(month.contributions.me/totalIn*100):0}%</span>
                    <span>Lois's {totalIn>0?Math.round(month.contributions.sister/totalIn*100):0}%</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="label" style={{marginBottom:12}}>Expense Breakdown</div>
              {ALL_CATS.map(key=>{
                const val=month.expenses[key]||0,pct=totalOut>0?(val/totalOut*100):0;
                return(
                  <div key={key} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                      <span>{CAT_ICONS[key]} {CAT_LABELS[key]}</span>
                      <span style={{color:CATEGORY_COLORS[key]}}>{fmtK(val)}</span>
                    </div>
                    <div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`,background:CATEGORY_COLORS[key]}}/></div>
                  </div>
                );
              })}
            </div>
            {transactions.length>0&&(
              <div className="card">
                <div className="label" style={{marginBottom:10}}>Recent Transactions</div>
                {[...transactions].reverse().slice(0,5).map(tx=>(
                  <div key={tx.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F0F2FA",fontSize:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span>{CAT_ICONS[tx.category]}</span>
                      <span style={{color:"#6B7490"}}>{tx.note||CAT_LABELS[tx.category]}</span>
                      {tx.paidBy!=="shared"&&<span style={{fontSize:10,color:"#9EA8BF",padding:"1px 6px",border:"1.5px solid #E6EAF4",borderRadius:80}}>{tx.paidBy==="me"?"Ruth's":"Lois's"}</span>}
                    </div>
                    <span style={{color:CATEGORY_COLORS[tx.category]}}>{fmt(tx.amount)}</span>
                  </div>
                ))}
                {transactions.length>5&&<div style={{fontSize:10,color:"#9EA8BF",marginTop:8,textAlign:"right"}}>+{transactions.length-5} more in Transactions tab</div>}
              </div>
            )}
          </div>
        )}

        {/* CONTRIBUTIONS */}
        {activeTab==="contributions"&&(
          <div style={{display:"grid",gap:14}}>
            <div className="card">
              <div className="label" style={{marginBottom:18}}>Contributions — {MONTHS[monthIdx]} {year}</div>
              {[{key:"me",label:"Ruth's Contribution",color:"#2A9D8F"},{key:"sister",label:"Lois's Contribution",color:"#A8DADC"}].map(({key,label,color})=>(
                <div key={key} style={{marginBottom:22}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                    <div>
                      <div className="label">{label}</div>
                      <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,color}}>{fmtK(month.contributions[key]||0)}</div>
                    </div>
                    <div style={{width:120}}>
                      <div className="label">Amount</div>
                      <input type="number" placeholder="0" value={month.contributions[key]||""} onChange={e=>updateField(`contributions.${key}`,num(e.target.value))}/>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{height:1,background:"#EEF0F8",margin:"14px 0"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div className="label">Starting Balance</div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:20}}>{fmtK(startBal)}</div>
                  <div style={{fontSize:10,color:"#9EA8BF",marginTop:2}}>{month.startingBalanceManual?"manually set ✏️":"auto-carried ↩"}</div>
                </div>
                <div style={{width:130}}>
                  <div className="label">Override</div>
                  <input type="number" placeholder="0" value={month.startingBalance||""} onChange={e=>{updateField("startingBalance",num(e.target.value));updateField("startingBalanceManual",true);}}/>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="label" style={{marginBottom:12}}>Monthly Summary</div>
              {[
                {label:"Starting Balance",value:fmtK(startBal),color:"#6B7490"},
                {label:"+ Total Contributions",value:fmtK(totalIn),color:"#2A9D8F"},
                {label:"− Total Expenses",value:fmtK(totalOut),color:"#E76F51"},
                {label:"= Ending Balance",value:fmtK(endBal),color:endBal>=0?"#2A9D8F":"#E76F51",bold:true},
              ].map(r=>(
                <div className="row-item" key={r.label}>
                  <span style={{fontSize:12,color:"#6B7490"}}>{r.label}</span>
                  <span style={{color:r.color,fontWeight:r.bold?700:400,fontSize:r.bold?17:13}}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EXPENSES */}
        {activeTab==="expenses"&&(
          <div className="card">
            <div className="label" style={{marginBottom:18}}>Expenses — {MONTHS[monthIdx]} {year}</div>
            {ALL_CATS.map(key=>(
              <div key={key} className="row-item" style={{paddingTop:13,paddingBottom:13}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:17}}>{CAT_ICONS[key]}</span>
                  <div>
                    <div style={{fontSize:13}}>{CAT_LABELS[key]}</div>
                    {CAT_KEYS.includes(key)&&transactions.filter(t=>t.category===key).length>0&&(
                      <div style={{fontSize:10,color:"#9EA8BF"}}>{transactions.filter(t=>t.category===key).length} transactions</div>
                    )}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:CATEGORY_COLORS[key],minWidth:75,textAlign:"right"}}>{fmtK(month.expenses[key]||0)}</div>
                  <div style={{width:95}}><input type="number" placeholder="0" value={month.expenses[key]||""} onChange={e=>updateField(`expenses.${key}`,num(e.target.value))}/></div>
                </div>
              </div>
            ))}
            <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid #F0F2FA",display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:11,color:"#9EA8BF",textTransform:"uppercase",letterSpacing:"0.15em"}}>Total Out</span>
              <span style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:"#E76F51"}}>{fmtK(totalOut)}</span>
            </div>
          </div>
        )}

        {/* TRANSACTIONS */}
        {activeTab==="transactions"&&(
          <div style={{display:"grid",gap:14}}>
            {/* Add new transaction */}
            <div className="card">
              <div className="label" style={{marginBottom:16}}>Add Transaction</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                <div>
                  <div className="label">Amount ($)</div>
                  <input type="number" placeholder="0.00" value={txAmount} onChange={e=>setTxAmount(e.target.value)} style={{fontSize:16}}/>
                </div>
                <div>
                  <div className="label">Category</div>
                  <select value={txCat} onChange={e=>setTxCat(e.target.value)}>
                    {ALL_CATS.map(k=><option key={k} value={k}>{CAT_ICONS[k]} {CAT_LABELS[k]}</option>)}
                  </select>
                </div>
                <div>
                  <div className="label">Date</div>
                  <input type="date" value={txDate} onChange={e=>setTxDate(e.target.value)}/>
                </div>
                <div>
                  <div className="label">Paid By</div>
                  <select value={txPaidBy} onChange={e=>setTxPaidBy(e.target.value)}>
                    <option value="shared">Shared</option>
                    <option value="me">Ruth's</option>
                    <option value="sister">Lois's</option>
                  </select>
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <div className="label">Note (optional)</div>
                <input type="text" placeholder="e.g. Trader Joe's, electricity bill..." value={txNote} onChange={e=>setTxNote(e.target.value)}/>
              </div>
              <button className="add-btn" onClick={addTransaction}>+ Add Transaction</button>
            </div>

            {/* Transaction list */}
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div className="label" style={{marginBottom:0}}>All Transactions — {MONTHS[monthIdx]} {year}</div>
                <div style={{fontSize:11,color:"#9EA8BF"}}>{transactions.length} total</div>
              </div>
              {transactions.length===0&&(
                <div style={{color:"#DDE2EC",fontSize:12,textAlign:"center",padding:"30px 0"}}>No transactions yet this month</div>
              )}
              {/* Header */}
              {transactions.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"60px 1fr 80px 70px 28px",gap:8,marginBottom:6}}>
                  {["Date","Note / Category","Amount","Paid By",""].map(h=><span key={h} style={{fontSize:9,color:"#DDE2EC",textTransform:"uppercase",letterSpacing:"0.1em"}}>{h}</span>)}
                </div>
              )}
              {[...transactions].reverse().map(tx=>(
                <div key={tx.id} className="tx-row">
                  <span style={{color:"#9EA8BF",fontSize:11}}>{tx.date?.slice(5)||""}</span>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:13}}>{CAT_ICONS[tx.category]}</span>
                      <span style={{color:"#4B5563"}}>{tx.note||CAT_LABELS[tx.category]}</span>
                    </div>
                    <div style={{fontSize:10,color:"#9EA8BF"}}>{CAT_LABELS[tx.category]}</div>
                  </div>
                  <span style={{textAlign:"right",color:CATEGORY_COLORS[tx.category]||"#1A1D23",fontWeight:500}}>{fmt(tx.amount)}</span>
                  <span style={{textAlign:"center",fontSize:10,color:tx.paidBy==="me"?"#2A9D8F":tx.paidBy==="sister"?"#A8DADC":"#9EA8BF"}}>
                    {tx.paidBy==="me"?"Ruth's":tx.paidBy==="sister"?"Lois's":"Shared"}
                  </span>
                  <button className="del-btn" onClick={()=>deleteTransaction(tx.id)}>×</button>
                </div>
              ))}
            </div>

            {/* Category totals from transactions */}
            {transactions.length>0&&(
              <div className="card">
                <div className="label" style={{marginBottom:12}}>Category Totals (from transactions)</div>
                {ALL_CATS.map(key=>{
                  const total=transactions.filter(t=>t.category===key).reduce((s,t)=>s+t.amount,0);
                  if(total===0) return null;
                  return(
                    <div key={key} className="row-item">
                      <span style={{fontSize:12}}>{CAT_ICONS[key]} {CAT_LABELS[key]}</span>
                      <span style={{color:CATEGORY_COLORS[key]}}>{fmt(total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* BUDGET & NOTES */}
        {activeTab==="budget & notes"&&(
          <div style={{display:"grid",gap:14}}>
            <div className="card">
              <div className="label" style={{marginBottom:14}}>Variable Budget vs Actual (excl. Rent)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",gap:8,marginBottom:10}}>
                {["Category","Budget","Actual","Diff"].map(h=><span key={h} style={{fontSize:9,color:"#9EA8BF",letterSpacing:"0.1em",textTransform:"uppercase",textAlign:h!=="Category"?"right":"left"}}>{h}</span>)}
              </div>
              {CAT_KEYS.map(key=>{
                const bud=month.budget[key]||0,act=month.expenses[key]||0,diff=bud-act;
                return(
                  <div key={key} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",gap:8,alignItems:"center",padding:"9px 0",borderBottom:"1px solid #F0F2FA"}}>
                    <span style={{fontSize:12}}>{CAT_ICONS[key]} {CAT_LABELS[key]}</span>
                    <div><input type="number" placeholder="0" value={month.budget[key]||""} onChange={e=>updateField(`budget.${key}`,num(e.target.value))} style={{textAlign:"right"}}/></div>
                    <span style={{textAlign:"right",fontSize:12,color:CATEGORY_COLORS[key]}}>{fmtK(act)}</span>
                    <span style={{textAlign:"right",fontSize:12,color:diff>=0?"#2A9D8F":"#E76F51"}}>{diff>=0?"+":""}{fmtK(diff)}</span>
                  </div>
                );
              })}
              <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",gap:8,paddingTop:12}}>
                <span style={{fontSize:10,color:"#9EA8BF",textTransform:"uppercase"}}>Total</span>
                <span style={{textAlign:"right",fontWeight:600}}>{fmtK(totalBudget)}</span>
                <span style={{textAlign:"right",fontWeight:600,color:"#E76F51"}}>{fmtK(nonRentOut)}</span>
                <span style={{textAlign:"right",fontWeight:600,color:netChange>=0?"#2A9D8F":"#E76F51"}}>{netChange>=0?"+":""}{fmtK(netChange)}</span>
              </div>
            </div>
            <div className="card" style={{borderTop:`2px solid ${netChange>=0?"#2A9D8F":"#E76F51"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div className="label">Net Change</div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:netChange>=0?"#2A9D8F":"#E76F51"}}>{netChange>=0?"+":""}{fmtK(netChange)}</div>
                  <div style={{fontSize:11,color:"#9EA8BF",marginTop:3}}>{netChange>=0?"Under budget 🎉":"Over budget — watch it!"}</div>
                </div>
                <div style={{width:86,height:86,borderRadius:"50%",border:`3px solid ${netChange>=0?"#2A9D8F":"#E76F51"}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                  <div style={{fontSize:9,color:"#9EA8BF"}}>SPENT</div>
                  <div style={{fontSize:15,fontWeight:600}}>{totalBudget>0?Math.round(nonRentOut/totalBudget*100):0}%</div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="label" style={{marginBottom:8}}>Notes & Comments</div>
              <textarea placeholder={`Notes for ${MONTHS[monthIdx]}... 这个月外卖点太多了 😅`} value={month.comment||""} onChange={e=>updateField("comment",e.target.value)} style={{fontSize:13,lineHeight:1.8,color:"#4B5563"}}/>
            </div>
          </div>
        )}

        {/* ANALYSIS */}
        {activeTab==="analysis"&&(
          <div style={{display:"grid",gap:14}}>
            <div style={{fontSize:10,color:"#9EA8BF",letterSpacing:"0.1em"}}>LAST {history.length} MONTHS WITH DATA (UP TO 6)</div>
            <div className="card">
              <div className="label" style={{marginBottom:12}}>Ending Balance Trend</div>
              <LineChart data={history.map(h=>({value:h.endBal}))} color="#2A9D8F" height={80}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                {history.map(h=><span key={`${h.year}-${h.month}`} style={{fontSize:10,color:"#9EA8BF"}}>{h.label}</span>)}
              </div>
            </div>
            <div className="card">
              <div className="label" style={{marginBottom:12}}>In vs Out</div>
              <div style={{display:"flex",gap:14}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:"#2A9D8F",marginBottom:4,letterSpacing:"0.1em"}}>▲ IN</div>
                  <LineChart data={history.map(h=>({value:h.totalIn}))} color="#2A9D8F" height={60}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:"#E76F51",marginBottom:4,letterSpacing:"0.1em"}}>▼ OUT</div>
                  <LineChart data={history.map(h=>({value:h.totalOut}))} color="#E76F51" height={60}/>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                {history.map(h=><span key={`${h.year}-${h.month}`} style={{fontSize:10,color:"#9EA8BF"}}>{h.label}</span>)}
              </div>
            </div>
            <div className="card">
              <div className="label" style={{marginBottom:12}}>Spending by Category</div>
              {history.length>=2?<BarChart cats={CAT_KEYS} months={history}/>:<div style={{color:"#9EA8BF",fontSize:11,padding:"18px 0"}}>Need at least 2 months of data</div>}
              <div style={{display:"flex",gap:12,marginTop:10,flexWrap:"wrap"}}>
                {CAT_KEYS.map(k=>(
                  <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#8B93A8"}}>
                    <div style={{width:8,height:8,background:CATEGORY_COLORS[k],borderRadius:8}}/>{CAT_LABELS[k]}
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="label" style={{marginBottom:12}}>Month by Month</div>
              <div style={{display:"grid",gridTemplateColumns:"65px 1fr 1fr 1fr",gap:8,marginBottom:7}}>
                {["Month","In","Out","Balance"].map(h=><span key={h} style={{fontSize:9,color:"#9EA8BF",letterSpacing:"0.1em",textTransform:"uppercase",textAlign:h!=="Month"?"right":"left"}}>{h}</span>)}
              </div>
              {history.map(h=>(
                <div key={`${h.year}-${h.month}`} style={{display:"grid",gridTemplateColumns:"65px 1fr 1fr 1fr",gap:8,padding:"7px 0",borderBottom:"1px solid #F0F2FA",fontSize:12}}>
                  <span style={{color:h.year===year&&h.month===monthIdx?"#F4A261":"#6B7490"}}>{h.label}{h.year!==year?` '${String(h.year).slice(2)}`:""}</span>
                  <span style={{textAlign:"right",color:"#2A9D8F"}}>{fmtK(h.totalIn)}</span>
                  <span style={{textAlign:"right",color:"#E76F51"}}>{fmtK(h.totalOut)}</span>
                  <span style={{textAlign:"right",color:h.endBal>=0?"#2A9D8F":"#E76F51"}}>{fmtK(h.endBal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
