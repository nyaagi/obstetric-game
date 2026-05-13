// game.js

// --- ゲームのロジック ---
const EFW_DATA = { 18: 200, 20: 300, 22: 450, 24: 650, 26: 900, 28: 1200, 30: 1500, 32: 1850, 34: 2200, 36: 2550, 38: 2900, 40: 3200, 42: 3450 };
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

class Patient {
    constructor(mode) {
        this.mode = mode;
        this.week = 8;
        this.age = 22 + Math.floor(Math.random() * 18) + (mode === 'High-Risk' ? 5 : 0);
        this.bmi = 18 + Math.random() * 8 + (mode === 'High-Risk' ? 4 : 0);
        this.twin = (mode === 'High-Risk' && Math.random() < 0.35);
        this.wt0 = 45 + Math.random() * 25;
        this.wt = this.wt0;
        this.bp = 108 + Math.random() * 12;
        this.cl = 40.0;
        this.pf = 0.9 + Math.random() * 0.2;
        this.pf2 = 0.9 + Math.random() * 0.2;
        this.hdp = false; this.gdm = false; this.gbs = false;
        this.prev_cs = Math.random() < 0.2;
        this.fp = Math.random() < 0.1 ? 1 : 0;
        this.med = false; this.rest = false; this.hosp = false; this.ins = false;
        this.labs = null; this.labW = -1;
        this.needDel = false; this.done = false; this.reason = ""; this.delMode = "";
    }

    simulate(step) {
        this.week += step;
        const w = this.week;
        this.wt += (0.3 + Math.random() * 0.3) * step * (this.gdm && !this.ins ? 1.4 : 1.0);

        if (w > 20 && !this.hdp) {
            if (Math.random() < (this.bmi > 25 ? 0.05 : 0.01) * step) this.hdp = true;
        }
        if (this.hdp) {
            this.bp += (2 + Math.random() * 4) * step * (this.med ? 0.6 : 1.0);
        }
        if (w > 20) {
            this.cl -= (0.5 + Math.random() * 1.0) * step * (this.rest ? 0.5 : 1.0);
        }

        this.checkLabs();
        if (this.week >= 41.5) { this.needDel = true; this.reason = "過期妊娠"; }
        if (this.hdp && this.bp > 175) { this.needDel = true; this.reason = "重症HDP(HELLP/子癇切迫)"; }
        if (this.cl < 5 && this.week >= 34) { this.needDel = true; this.reason = "切迫早産からの分娩"; }
        if (this.week >= 37 && Math.random() < 0.1 * step) { this.needDel = true; this.reason = "自然陣痛"; }
    }

    checkLabs() {
        const w = Math.floor(this.week);
        if (w >= 10 && w <= 12 && this.labW < 10) {
            this.labs = { "Type": "初期", "週数": w, "Hb": (11.5 + Math.random() * 2).toFixed(1), "Plt": Math.floor(15 + Math.random() * 15) + "万", "随時血糖": 85 + Math.floor(Math.random() * 25), "風疹": "HI 32x", "HBsAg": "陰性", "HIV": "陰性", "梅毒": "陰性", "ｸﾗﾐｼﾞｱ": "陰性" };
            this.labW = w;
        } else if (w >= 24 && w <= 26 && this.labW < 24) {
            this.gdm = Math.random() < 0.1;
            this.labs = { "Type": "中期", "週数": w, "50gGCT": this.gdm ? "152 (異常)" : "98 (正常)", "Hb": (10.5 + Math.random() * 2).toFixed(1) };
            this.labW = w;
        } else if (w >= 34 && w <= 36 && this.labW < 34) {
            this.gbs = Math.random() < 0.15;
            this.labs = { "Type": "後期", "週数": w, "GBS": this.gbs ? "陽性" : "陰性", "Hb": (10.0 + Math.random() * 2).toFixed(1) };
            this.labW = w;
        } else if (this.hosp && (w - this.labW >= 1)) {
            this.labs = { "Type": "入院中", "週数": w, "WBC": Math.floor(7000 + Math.random() * 6000), "CRP": (Math.random() * 3).toFixed(2), "Hb": (9.5 + Math.random() * 2).toFixed(1), "Plt": Math.floor(15 + Math.random() * 15) + "万" };
            this.labW = w;
        }
    }
}

let p;
let selected = new Set();

function initGame(mode) {
    p = new Patient(mode);
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-ui').style.display = 'flex';
    updateUI();
}

function updateUI() {
    const w = Math.floor(p.week);
    const interval = p.hosp ? "1週" : (w < 24 ? "4週" : (w < 36 ? "2週" : "1週"));
    document.getElementById('header-area').innerText = `【${p.mode === 'Standard' ? '一般' : '高度'}】${w}週 - ${p.hosp ? '入院' : '外来'}（${interval}）`;

    document.getElementById('s-text').innerText = (p.cl < 20 ? "お腹が張る" : (p.bp > 160 ? "頭が重い、目がチカチカする" : "特になし"));

    let o = `BP: ${Math.floor(p.bp)}/${Math.floor(p.bp * 0.6)} mmHg\n`;
    o += `体重: ${p.wt.toFixed(1)}kg (+${(p.wt - p.wt0).toFixed(1)}kg)\n`;
    o += `尿蛋白: ${p.hdp ? (p.bp > 160 ? '(2+)' : '(1+)') : '(-)'}  尿糖: ${p.gdm ? '(1+)' : '(-)'}\n`;
    o += `CL: ${p.cl.toFixed(1)}mm\n`;
    if (w < 8) o += `GS: ${(p.week * 2.5).toFixed(1)}mm`;
    else if (w < 12) o += `CRL: ${((p.week - 7) * 9 + 5).toFixed(1)}mm`;
    else if (w >= 18) {
        let w1 = Math.floor(getEfw(p.week) * p.pf * (p.gdm && !p.ins ? 1.15 : 1.0));
        if (p.twin) {
            let w2 = Math.floor(getEfw(p.week) * p.pf2);
            o += `EFW: F1 ${w1}g / F2 ${w2}g`;
        } else {
            o += `EFW: ${w1}g`;
        }
    }
    document.getElementById('o-text').innerText = o;

    const labDiv = document.getElementById('lab-area');
    labDiv.innerHTML = "";
    if (p.labs) {
        let h = `<div class="lab-box"><div class="lab-header">┌─ Lab (${p.labs.週数}週: ${p.labs.Type}) ─┐</div>`;
        for (let k in p.labs) {
            if (k === "Type" || k === "週数") continue;
            let val = p.labs[k];
            let isAbn = (k === "Hb" && val < 10.5) || (val.toString().includes("陽性")) || (val.toString().includes("異常")) || (k === "随時血糖" && val >= 100) || (k === "CRP" && val > 0.5) || (k === "Plt" && parseInt(val) < 10);
            h += `<div class="lab-row ${isAbn ? 'lab-warn' : ''}"><span>${k}:</span> <span>${val}${isAbn ? ' ⚠' : ''}</span></div>`;
        }
        h += `<div>└───────────────┘</div></div>`;
        labDiv.innerHTML = h;
    }

    let probs = [];
    if (p.hdp) probs.push("妊娠高血圧症候群(HDP)");
    if (p.gdm) probs.push("妊娠糖尿病(GDM)" + (p.ins ? "[Ins導入済]" : ""));
    if (p.cl < 25) probs.push("切迫早産");
    if (p.prev_cs) probs.push("既往帝王切開");
    if (p.fp !== 0) probs.push("胎位異常(骨盤位)");
    if (p.twin) probs.push("双胎妊娠");
    document.getElementById('a-text').innerText = probs.join('\n') || "順調";

    let bg = "";
    if (p.hosp) bg = `assets/Inpatient/inpatient_${(w % 2) + 1}.jpg`;
    else bg = `assets/Outpatient/outpatient_${(w % 3) + 1}.jpg`;

    const container = document.getElementById('game-container');
    container.style.backgroundImage = `url('${bg}')`;

    renderButtons();
}

function renderButtons() {
    const grid = document.getElementById('btn-grid');
    grid.innerHTML = "";
    selected.clear();
    let opts = p.hosp ?
        ["安静継続", "塩分制限食", "降圧薬/抑制剤", "NST毎日実施", "退院許可", "分娩決定"] :
        ["妊婦健診", "1週後再診", "2-3日後再診", "自宅安静指示", "鉄剤処方", "管理入院判断"];
    if (p.gdm && !p.ins && p.hosp) opts[1] = "インスリン導入";

    opts.forEach(t => {
        const b = document.createElement('div');
        b.className = "btn"; b.innerText = t;
        b.onclick = () => {
            if (selected.has(t)) { selected.delete(t); b.classList.remove('selected'); }
            else { selected.add(t); b.classList.add('selected'); }
        };
        grid.appendChild(b);
    });
}

function nextWeek() {
    if (selected.size === 0) return;
    let step = p.hosp ? 1.0 : (p.week < 24 ? 4.0 : (p.week < 36 ? 2.0 : 1.0));
    selected.forEach(t => {
        if (t.includes("1週後")) step = 1.0;
        if (t.includes("2-3日後")) step = 0.5;
        if (t.includes("入院")) p.hosp = true;
        if (t.includes("退院")) p.hosp = false;
        if (t.includes("インスリン")) { p.ins = true; p.hosp = true; }
        if (t.includes("降圧薬") || t.includes("抑制剤")) p.med = true;
        if (t.includes("安静")) p.rest = true;
        if (t.includes("分娩")) { p.needDel = true; p.reason = "分娩方針決定(予定分娩)"; }
    });
    p.simulate(step);
    if (p.needDel) showDeliveryPhase(); else updateUI();
}

function showDeliveryPhase() {
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('delivery-screen').style.display = 'flex';
    document.getElementById('del-reason-title').innerText = `【${Math.floor(p.week)}週】 理由: ${p.reason}`;
    document.getElementById('game-container').style.backgroundImage = "url('assets/Delivery/delivery.jpg')";
}

function executeDelivery(idx) {
    document.getElementById('delivery-screen').style.display = 'none';
    p.done = true;
    let modes = ["経膣分娩", "分娩誘発", "予定帝王切開", "緊急帝王切開", "超緊急帝王切開"];
    p.delMode = modes[idx - 1];

    p.err = false;
    p.errMsg = "";
    let cs_ind = p.twin || p.prev_cs || p.fp !== 0;
    if (cs_ind && idx <= 2) { p.err = true; p.errMsg = "適応外の経膣分娩試行（子宮破裂/難産リスク）"; }
    if (p.reason.includes("重症") && idx !== 5) { p.err = true; p.errMsg = "超緊急事態に対する初動遅れ"; }

    showOutcome();
}

function showOutcome() {
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('outcome-screen').style.display = 'flex';

    let w1 = Math.floor(getEfw(p.week) * p.pf);
    let weightStr = `${w1}g`;
    if (p.twin) {
        let w2 = Math.floor(getEfw(p.week) * p.pf2);
        weightStr = `F1: ${w1}g / F2: ${w2}g`;
    }

    document.getElementById('outcome-desc').innerText = `${Math.floor(p.week)}週 分娩\n理由: ${p.reason}\n方針: ${p.delMode}\n児体重: ${weightStr}\n出血量: ${Math.floor((p.err ? 1200 : 400) + Math.random() * 400)}ml`;

    if (p.err) {
        document.getElementById('outcome-audit').innerHTML = `<li style="color:#cc0000;">❌ 評価: 不適切<br>理由: ${p.errMsg}<br>Apgar Score: 3/5</li>`;
    } else {
        document.getElementById('outcome-audit').innerHTML = "<li>✅ 評価: 適切<br>ガイドラインに沿った管理でした。<br>Apgar Score: 8/9</li>";
    }

    let bg = p.err ? "assets/outcume/bad.jpg" : "assets/outcume/delivery_good.jpg";
    document.getElementById('game-container').style.backgroundImage = `url('${bg}')`;
}