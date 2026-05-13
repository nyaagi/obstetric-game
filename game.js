// game.js
// 産科臨床シミュレーター Web版 ロジックエンジン v2.0
// 画像拡張子は .jpg で統一。複数選択UIを強化。

// --- 胎児発育曲線データ ---
const EFW_DATA = { 18: 200, 20: 310, 22: 450, 24: 650, 26: 900, 28: 1200, 30: 1500, 32: 1850, 34: 2200, 36: 2550, 38: 2900, 40: 3200, 42: 3450 };
const getEfw = (w) => {
    const keys = Object.keys(EFW_DATA).map(Number).sort((a, b) => a - b);
    if (w < 18) return 0;
    if (w >= 42) return EFW_DATA[42];
    for (let i = 0; i < keys.length - 1; i++) {
        if (w >= keys[i] && w < keys[i + 1]) {
            let t = (w - keys[i]) / (keys[i + 1] - keys[i]);
            return EFW_DATA[keys[i]] + t * (EFW_DATA[keys[i + 1]] - EFW_DATA[keys[i]]);
        }
    }
};

// --- 患者クラス ---
class Patient {
    constructor(mode) {
        this.mode = mode;
        this.week = 8.0;
        this.age = 22 + Math.floor(Math.random() * 18) + (mode === 'High-Risk' ? 5 : 0);
        this.bmi = 18 + Math.random() * 8 + (mode === 'High-Risk' ? 4 : 0);
        this.twin = (mode === 'High-Risk' && Math.random() < 0.30);
        this.wt0 = 45 + Math.random() * 25;
        this.wt = this.wt0;
        this.bp = 108 + Math.random() * 12;
        this.bp_d = Math.floor(this.bp * 0.65);
        this.cl = 40.0;
        this.pf = 0.9 + Math.random() * 0.2; // 胎盤機能
        this.pf2 = 0.9 + Math.random() * 0.2;
        
        // 疾患フラグ
        this.hdp = false; this.gdm = false; this.gbs = false;
        this.prev_cs = Math.random() < 0.2;
        this.fp = Math.random() < 0.1 ? 1 : 0; // 0:頭位, 1:骨盤位
        this.fp2 = Math.random() < 0.3 ? 1 : 0; // 双胎の第2児
        
        // 治療・管理フラグ
        this.med = false; this.rest = false; this.hosp = false; 
        this.ins = false; this.diet = false; this.salt_diet = false;
        this.prom = false; this.gbs_treat = false; this.steroid = false;
        
        // 重症度
        this.fgr = false; this.hellp = false; this.cam = false;
        this.parity = Math.random() < 0.6 ? 0 : 1; 
        this.gravidity = this.parity + 1 + Math.floor(Math.random() * 2);
        
        // 分娩・結果用
        this.needDel = false; this.done = false; this.reason = ""; this.delMode = "";
        this.labs = null; this.labW = -1;
        this.bishop = 0; this.fhr = 1; this.laborHours = 0; this.vacuumAttempts = 0;
        this.err = false; this.errMsg = "";
    }

    simulate(step) {
        if (this.done) return;
        this.week += step;
        const w = this.week;
        
        // 体重変化
        let baseGain = (this.bmi < 18.5 ? 0.35 : (this.bmi < 25 ? 0.25 : 0.15));
        let gdmFactor = (this.gdm && !this.ins) ? 1.2 : 1.0;
        this.wt += (baseGain + Math.random() * 0.1) * step * gdmFactor;
        
        // HDP進行
        if (w > 20 && !this.hdp) {
            let hdpRisk = (this.bmi > 25 ? 0.04 : 0.01) * (this.twin ? 2.5 : 1.0);
            if (Math.random() < hdpRisk * step) this.hdp = true;
        }
        if (this.hdp) {
            let hdpFactor = (this.med ? 0.5 : 1.0) * (this.salt_diet ? 0.8 : 1.0);
            this.bp += (2 + Math.random() * 5) * step * hdpFactor;
            this.bp_d = Math.floor(this.bp * (0.6 + Math.random() * 0.1));
            if (this.bp > 170 && Math.random() < 0.1 * step) this.hellp = true;
            if (this.bp > 160 && !this.fgr && Math.random() < 0.15 * step) this.fgr = true;
        } else {
            this.bp_d = Math.floor(this.bp * 0.65);
        }

        // 頸管長短縮 (20週以降)
        if (w > 20) {
            let clStep = (0.5 + Math.random() * 1.5) * (this.twin ? 1.8 : 1.0);
            this.cl -= clStep * step * (this.rest ? 0.4 : 1.0);
            if (this.cl < 0) this.cl = 0;
        }

        // PROM / CAM
        if (!this.prom && w > 24 && Math.random() < (w > 34 ? 0.06 : 0.015) * step) {
            this.prom = true; this.hosp = true; this.reason = "前期破水(PROM)";
        }
        if (this.prom && !this.cam && w < 37 && Math.random() < 0.2 * step) {
            this.cam = true;
        }

        // 定期検査
        this.checkLabs();
        
        // 分娩トリガー判定
        if (this.week >= 41.5) { this.needDel = true; this.reason = "過期妊娠"; }
        else if (this.hellp) { this.needDel = true; this.reason = "HELLP症候群"; }
        else if (this.cam) { this.needDel = true; this.reason = "絨毛膜羊膜炎(CAM)"; }
        else if (this.hdp && this.bp > 175) { this.needDel = true; this.reason = "重症HDP(子癇切迫)"; }
        else if (this.prom && this.week >= 37) { this.needDel = true; this.reason = "正期産PROM"; }
        else if (this.cl < 5 && this.week >= 34) { this.needDel = true; this.reason = "切迫早産進行"; }
        else if (this.week >= 37) {
            let laborProb = (w >= 40 ? 0.25 : (w >= 39 ? 0.15 : (w >= 38 ? 0.08 : 0.03)));
            if (Math.random() < laborProb * step) { this.needDel = true; this.reason = "自然陣痛"; }
        }
    }

    checkLabs() {
        const w = Math.floor(this.week);
        if (w >= 10 && w <= 12 && this.labW < 10) {
            this.labs = { "Type": "初期", "週数": w, "Hb": (11.5 + Math.random() * 2).toFixed(1), "Plt": Math.floor(15 + Math.random() * 15) + "万", "随時血糖": 85 + Math.floor(Math.random() * 25), "風疹": "HI 32x", "HBsAg": "陰性", "子宮頸がん": "NILM" };
            this.labW = w;
        } else if (w >= 24 && w <= 26 && this.labW < 24) {
            if (Math.random() < 0.1) this.gdm = true;
            this.labs = { "Type": "中期", "週数": w, "50gGCT": this.gdm ? "148 (異常)" : "102 (正常)", "Hb": (10.5 + Math.random() * 2).toFixed(1) };
            this.labW = w;
        } else if (w >= 34 && w <= 36 && this.labW < 34) {
            this.gbs = Math.random() < 0.18;
            this.labs = { "Type": "後期", "週数": w, "GBS": this.gbs ? "陽性" : "陰性", "Hb": (10.0 + Math.random() * 2).toFixed(1) };
            this.labW = w;
        } else if (this.hosp && (w - this.labW >= 1)) {
            this.labs = { 
                "Type": "入院精査", "週数": w, 
                "WBC": Math.floor(7000 + Math.random() * (this.cam ? 12000 : 4000)), 
                "CRP": (this.cam ? 3 + Math.random() * 8 : Math.random() * 0.4).toFixed(2),
                "PLT": (this.hellp ? 6 + Math.random() * 4 : 15 + Math.random() * 15).toFixed(1) + "万",
                "LDH": this.hellp ? 550 + Math.floor(Math.random() * 300) : 190
            };
            this.labW = w;
        }
    }
}

// --- グローバル ---
let p;
let selected = new Set();

function initGame(mode) {
    p = new Patient(mode);
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-ui').style.display = 'flex';
    updateUI();
}

function updateUI() {
    if (!p) return;
    const w = Math.floor(p.week);
    
    // ヘッダー
    const interval = p.hosp ? "1週" : (w < 24 ? "4週" : (w < 36 ? "2週" : "1週"));
    document.getElementById('header-area').innerText = `【${p.mode === 'Standard' ? '医院' : '高度'}】${w}週 - ${p.hosp ? '入院' : '外来'}（${interval}）`;

    // S/O
    document.getElementById('s-text').innerText = (p.cl < 15 ? "お腹が張る、重い" : (p.bp > 160 ? "頭痛・眼華閃光あり" : "特になし"));
    
    let efw = 0;
    if (w >= 18) {
        let gdmFactor = (p.gdm && !p.ins) ? 1.12 : 1.0;
        efw = Math.floor(getEfw(p.week) * p.pf * gdmFactor);
    }
    
    let o = `BP: ${Math.floor(p.bp)}/${Math.floor(p.bp_d)} mmHg\n`;
    o += `体重: ${p.wt.toFixed(1)}kg (+${(p.wt - p.wt0).toFixed(1)}kg)\n`;
    o += `尿蛋白: ${p.hdp ? (p.bp > 160 ? '(2+)' : '(1+)') : '(-)'} / 尿糖: ${p.gdm ? '(1+)' : '(-)'}\n`;
    o += `CL: ${p.cl.toFixed(1)}mm\n`;
    if (w >= 18) {
        if (p.twin) o += `EFW: F1 ${efw}g / F2 ${Math.floor(efw * 0.95)}g`;
        else o += `EFW: ${efw}g`;
    }
    document.getElementById('o-text').innerText = o;

    // Labs
    const labDiv = document.getElementById('lab-area');
    if (p.labs) {
        let h = `<div class="lab-box"><div class="lab-header">┌ Lab (${p.labs.週数}週: ${p.labs.Type}) ┐</div>`;
        for (let k in p.labs) {
            if (k === "Type" || k === "週数") continue;
            let val = p.labs[k];
            let isAbn = _isAbnormal(k, val);
            h += `<div class="lab-row ${isAbn ? 'lab-warn' : ''}"><span>${k}:</span> <span>${val}${isAbn ? ' ⚠' : ''}</span></div>`;
        }
        h += `<div>└────────────┘</div></div>`;
        labDiv.innerHTML = h;
    } else {
        labDiv.innerHTML = "";
    }

    // A
    let probs = [`${p.gravidity}妊${p.parity}産 (${p.parity === 0 ? '初産' : '経産'})`];
    if (p.hellp) probs.push("HELLP症候群 ⚠");
    else if (p.hdp) probs.push(`HDP ${p.med ? "(降圧薬)" : ""}`);
    if (p.gdm) probs.push(`GDM ${p.ins ? "(Ins)" : (p.diet ? "(食事)" : "")}`);
    if (p.cl < 25) probs.push("切迫早産");
    if (p.twin) probs.push("双胎妊娠");
    if (p.prom) probs.push(p.cam ? "CAM合併 ⚠" : "PROM");
    document.getElementById('a-text').innerText = probs.join('\n') || "順調";

    // 背景
    const container = document.getElementById('game-container');
    let folder = p.hosp ? "Inpatient" : "Outpatient";
    let file = p.hosp ? `inpatient_${(w % 2) + 1}.jpg` : `outpatient_${(w % 3) + 1}.jpg`;
    container.style.backgroundImage = `url('assets/${folder}/${file}')`;
    
    renderButtons();
}

function _isAbnormal(k, val) {
    if (k === "Hb" && val < 10.5) return true;
    if (val.toString().includes("陽性")) return true;
    if (val.toString().includes("異常")) return true;
    if (k === "随時血糖" && val >= 100) return true;
    if (k === "CRP" && val > 0.5) return true;
    return false;
}

function renderButtons() {
    const grid = document.getElementById('btn-grid');
    if (!grid) return;
    grid.innerHTML = "";
    selected.clear();
    
    let opts = [];
    const w = Math.floor(p.week);
    const interval = w < 24 ? "4週後" : (w < 36 ? "2週後" : "1週後");

    if (p.needDel) {
        opts = ["分娩方針決定", "CTGモニター継続", "母体搬送の検討", "緊急帝王切開準備", "点滴ライン確保", "安静継続"];
    } else if (!p.hosp) {
        // 外来セット (常に6つ)
        opts = [
            `妊婦健診 (${interval})`,
            "1週後再診 (監視)",
            "2-3日後再診 (厳重)",
            "自宅安静指示",
            p.gdm ? "GDM食事指導/投薬" : "鉄剤・漢方等処方",
            "管理入院の判断"
        ];
    } else {
        // 入院セット (常に6つ)
        opts = [
            "安静継続 (1週後)",
            "降圧薬/抑制剤 調整",
            "NST (週数回)",
            "塩分制限/糖尿病食",
            "リンデロン(肺成熟)",
            "分娩方針の検討"
        ];
    }

    opts.forEach(t => {
        const b = document.createElement('div');
        b.className = "btn"; 
        b.innerText = t;
        b.onclick = () => {
            if (selected.has(t)) { 
                selected.delete(t); 
                b.classList.remove('selected'); 
            } else { 
                selected.add(t); 
                b.classList.add('selected'); 
            }
        };
        grid.appendChild(b);
    });
}

function nextWeek() {
    if (selected.size === 0) return;
    let step = p.hosp ? 1.0 : (p.week < 24 ? 4.0 : (p.week < 36 ? 2.0 : 1.0));
    
    selected.forEach(t => {
        if (t.includes("1週後")) step = 1.0;
        if (t.includes("入院")) p.hosp = true;
        if (t.includes("退院")) p.hosp = false;
        if (t.includes("食事指導")) p.diet = true;
        if (t.includes("インスリン")) { p.ins = true; p.hosp = true; }
        if (t.includes("リンデロン")) p.steroid = true;
        if (t.includes("降圧薬") || t.includes("抑制剤")) p.med = true;
        if (t.includes("安静指示")) p.rest = true;
        if (t.includes("分娩方針")) { p.needDel = true; p.reason = p.reason || "分娩方針決定"; }
    });
    
    p.simulate(step);
    if (p.needDel) showDeliveryPhase(); else updateUI();
}

function showDeliveryPhase() {
    document.getElementById('game-ui').style.display = 'none';
    const screen = document.getElementById('delivery-screen');
    screen.style.display = 'flex';
    document.getElementById('game-container').style.backgroundImage = "url('assets/Delivery/delivery.jpg')";

    screen.innerHTML = `
        <h1 style="font-size:48px; text-align:center; margin-bottom:10px; color:#000;">分娩方針の選択</h1>
        <h2 style="font-size:28px; text-align:center; color:#cc0000; margin-bottom:30px;">
            【${Math.floor(p.week)}週】 理由: ${p.reason}
        </h2>
        <div style="display:flex; flex-wrap:wrap; gap:15px; justify-content:center; max-width: 800px; margin: 0 auto;">
            <button class="btn" style="width:280px; height:70px;" onclick="executeDelivery(1)">経膣分娩試行</button>
            <button class="btn" style="width:280px; height:70px;" onclick="executeDelivery(2)">分娩誘発</button>
            <button class="btn" style="width:280px; height:70px;" onclick="executeDelivery(3)">予定帝王切開</button>
            <button class="btn" style="width:280px; height:70px;" onclick="executeDelivery(4)">緊急帝王切開</button>
            <button class="btn" style="width:580px; height:70px; border-color:#cc0000; color:#cc0000;" onclick="executeDelivery(5)">超緊急帝王切開</button>
        </div>
    `;
}

function executeDelivery(idx) {
    p.done = true;
    let modes = ["経膣分娩", "分娩誘発", "予定帝王切開", "緊急帝王切開", "超緊急帝王切開"];
    p.delMode = modes[idx - 1];

    if (idx === 3 || idx === 5) {
        showOutcome();
        return;
    }
    p.laborHours = 0;
    showLaborManagement(idx);
}

function showLaborManagement(initialIdx) {
    const screen = document.getElementById('delivery-screen');
    if (p.laborHours === 0) {
        p.bishop = Math.floor(Math.random() * 5) + (p.parity === 1 ? 3 : 1);
        p.fhr = 1;
    } else {
        p.bishop += Math.floor(Math.random() * 3);
        if (p.bishop > 13) p.bishop = 13;
        if (Math.random() < (p.fgr ? 0.25 : 0.08)) p.fhr = 3;
    }
    
    let dilation = Math.min(10, Math.floor(p.bishop * 0.8));
    let station = Math.floor(p.bishop / 3) - 2;
    if (p.bishop >= 12) station = 3;

    let ctgDetail = p.fhr === 3 ? "細変動消失・遅発一過性徐脈" : "基線 140bpm・細変動良好";
    let deliveryDone = (dilation >= 10 && station >= 2 && Math.random() < 0.75);

    if (deliveryDone) {
        screen.innerHTML = `<h1 style="font-size:48px; text-align:center;">分娩進行</h1><button class="btn" style="width:400px; height:100px; margin:40px auto;" onclick="finishLabor(1)">分娩完遂</button>`;
        return;
    }

    screen.innerHTML = `
        <h1 style="font-size:42px; text-align:center;">分娩管理 (${p.laborHours}h)</h1>
        <div style="display:flex; gap:15px; padding:20px; max-width:900px; margin:0 auto;">
            <div style="flex:1; background:white; padding:15px; border:2px solid #333;">
                <p style="font-size:24px;">子宮口: ${dilation}cm</p>
                <p style="font-size:24px;">下降度: St ${station >= 0 ? '+' + station : station}</p>
            </div>
            <div style="flex:1; background:white; padding:15px; border:2px solid #333;">
                <p style="font-size:24px;">CTG: ${ctgDetail}</p>
                <p style="font-size:24px; color:${p.fhr===3?'red':'black'}">Cat: ${p.fhr===1?'I':'III'}</p>
            </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin-top:20px;">
            <button class="btn" style="width:230px; height:65px;" onclick="p.laborHours+=2; showLaborManagement(${initialIdx})">2時間待機</button>
            <button class="btn" style="width:230px; height:65px;" onclick="tryVacuum(${initialIdx}, ${station})">吸引分娩</button>
            <button class="btn" style="width:580px; height:65px; border-color:#cc0000; color:#cc0000;" onclick="finishLabor(3)">緊急帝王切開</button>
        </div>
    `;
}

function tryVacuum(initialIdx, station) {
    p.vacuumAttempts++;
    let successChance = (station >= 2 ? 0.8 : (station === 1 ? 0.3 : 0.05));
    if (Math.random() < successChance) finishLabor(2);
    else if (p.vacuumAttempts >= 3) { alert("失敗。切替えます"); finishLabor(3); }
    else { alert("かかりません"); showLaborManagement(initialIdx); }
}

function finishLabor(finalIdx) {
    let cs_ind = p.twin || p.prev_cs || p.fp !== 0;
    if (cs_ind && finalIdx !== 3) { p.err = true; p.errMsg = "帝切適応の見逃し"; }
    if (p.fhr === 3 && finalIdx === 1) { p.err = true; p.errMsg = "NRFSへの対応不備"; }
    if (p.week < 34 && !p.steroid) { p.err = true; p.errMsg = "ステロイド未投与"; }
    
    let finalModes = ["経膣分娩", "吸引分娩", "緊急帝王切開"];
    p.delMode += ` → ${finalModes[finalIdx - 1]} (${p.laborHours}h)`;
    showOutcome();
}

function showOutcome() {
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('delivery-screen').style.display = 'none';
    document.getElementById('outcome-screen').style.display = 'flex';
    let weight = Math.floor(getEfw(p.week) * p.pf);
    document.getElementById('outcome-desc').innerText = `${Math.floor(p.week)}週 ${p.reason}\n${p.delMode}\n体重: ${weight}g`;
    document.getElementById('outcome-audit').innerHTML = p.err ? `<li style="color:red;">評価: 不適切<br>理由: ${p.errMsg}</li>` : "<li>評価: 適切<br>ガイドラインに沿った管理でした。</li>";
    let bg = p.err ? "assets/outcume/bad.jpg" : "assets/outcume/delivery_good.jpg";
    document.getElementById('game-container').style.backgroundImage = `url('${bg}')`;
}

function preloadImages() {
    const assets = [
        'assets/mainmenu/mainmenu.jpg',
        'assets/Outpatient/outpatient_1.jpg', 'assets/Outpatient/outpatient_2.jpg', 'assets/Outpatient/outpatient_3.jpg',
        'assets/Inpatient/inpatient_1.jpg', 'assets/Inpatient/inpatient_2.jpg',
        'assets/Delivery/delivery.jpg',
        'assets/outcume/delivery_good.jpg', 'assets/outcume/bad.jpg'
    ];
    assets.forEach(p => { const img = new Image(); img.src = p; });
}
