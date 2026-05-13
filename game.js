// game.js

// --- データ定義 ---
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

// --- 患者クラス ---
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
        this.med = false; this.rest = false; this.hosp = false; this.ins = false; this.diet = false;
        this.salt_diet = false; this.prom = false; this.gbs_treat = false;
        this.fgr = false;
        this.parity = Math.random() < 0.6 ? 0 : 1; // 0:初産, 1:経産
        this.gravidity = this.parity + 1 + Math.floor(Math.random() * 2);
        this.vacuumAttempts = 0;
        this.labs = null; this.labW = -1;
        this.needDel = false; this.done = false; this.reason = ""; this.delMode = "";
    }

    simulate(step) {
        this.week += step;
        const w = this.week;
        // 体重増加ロジック: BMIに基づいて基本増加量を調整 (痩せ型ほど増えやすく)
        let baseGain = (this.bmi < 18.5 ? 0.35 : (this.bmi < 25 ? 0.25 : 0.15));
        let gdmFactor = 1.0;
        if (this.gdm) {
            if (this.ins) gdmFactor = 1.0;
            else if (this.diet) gdmFactor = 1.1;
            else gdmFactor = 1.25;
        }
        this.wt += (baseGain + Math.random() * 0.15) * step * gdmFactor;
        if (w > 20 && !this.hdp) {
            if (Math.random() < (this.bmi > 25 ? 0.05 : 0.01) * step) this.hdp = true;
        }
        if (this.hdp) {
            // 降圧薬(0.6倍) と 減塩(0.8倍) の相乗効果
            let hdpFactor = (this.med ? 0.6 : 1.0) * (this.salt_diet ? 0.8 : 1.0);
            this.bp += (2 + Math.random() * 4) * step * hdpFactor;
            // HDPが悪化するとFGR（胎児発育不全）が発生しやすくなる
            if (this.bp > 160 && !this.fgr && Math.random() < 0.1 * step) this.fgr = true;
        }
        if (this.fgr) this.pf -= 0.02 * step; // FGRになると発育係数が低下

        if (w > 20) {
            this.cl -= (0.5 + Math.random() * 1.0) * step * (this.rest ? 0.5 : 1.0);
        }
        // PROM（前期破水）イベント (34週以降に確率上昇)
        if (!this.prom && w > 24 && Math.random() < (w > 34 ? 0.05 : 0.01) * step) {
            this.prom = true;
            this.hosp = true; // 破水したら原則入院
            this.reason = "前期破水(PROM)";
        }

        this.checkLabs();
        if (this.week >= 41.5) { this.needDel = true; this.reason = "過期妊娠"; }
        if (this.hdp && this.bp > 175) { this.needDel = true; this.reason = "重症HDP(HELLP/子癇切迫)"; }
        if (this.prom && this.week >= 37) { this.needDel = true; this.reason = "正期産PROM"; }
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
            if (this.gdm) this.labs["食後血糖"] = (this.ins ? 90 + Math.floor(Math.random() * 30) : 120 + Math.floor(Math.random() * 60));
            this.labW = w;
        } else if (this.gdm && (this.ins || this.diet) && (w - this.labW >= 2)) {
            this.labs = { "Type": "血糖モニタリング", "週数": w, "食前平均": (this.ins ? 85 : 95) + Math.floor(Math.random() * 20), "食後2h平均": (this.ins ? 110 : 135) + Math.floor(Math.random() * 30), "HbA1c": (this.ins ? 5.6 : 6.1).toFixed(1) };
            this.labW = w;
        }
    }
}

// --- グローバル変数 ---
let p;
let selected = new Set();

// --- ゲーム制御関数 ---
function initGame(mode) {
    p = new Patient(mode);
    const menu = document.getElementById('menu-screen');
    const ui = document.getElementById('game-ui');
    if (menu) menu.style.display = 'none';
    if (ui) ui.style.display = 'flex';
    updateUI();
}

function updateUI() {
    if (!p) return;
    const w = Math.floor(p.week);
    const header = document.getElementById('header-area');
    if (header) {
        const interval = p.hosp ? "1週" : (w < 24 ? "4週" : (w < 36 ? "2週" : "1週"));
        header.innerText = `【${p.mode === 'Standard' ? '一般' : '高度'}】${w}週 - ${p.hosp ? '入院' : '外来'}（${interval}）`;
    }

    const sText = document.getElementById('s-text');
    if (sText) sText.innerText = (p.cl < 20 ? "お腹が張る" : (p.bp > 160 ? "頭が重い、目がチカチカする" : "特になし"));

    const oText = document.getElementById('o-text');
    if (oText) {
        let o = `BP: ${Math.floor(p.bp)}/${Math.floor(p.bp * 0.6)} mmHg\n`;
        o += `体重: ${p.wt.toFixed(1)}kg (+${(p.wt - p.wt0).toFixed(1)}kg)\n`;
        o += `尿蛋白: ${p.hdp ? (p.bp > 160 ? '(2+)' : '(1+)') : '(-)'}  尿糖: ${p.gdm ? '(1+)' : '(-)'}\n`;
        o += `CL: ${p.cl.toFixed(1)}mm\n`;
        if (w < 8) o += `GS: ${(p.week * 2.5).toFixed(1)}mm`;
        else if (w < 12) o += `CRL: ${((p.week - 7) * 9 + 5).toFixed(1)}mm`;
        else if (w >= 18) {
            let gdmWeightFactor = 1.0;
            if (p.gdm) {
                if (p.ins) gdmWeightFactor = 1.0;
                else if (p.diet) gdmWeightFactor = 1.07;
                else gdmWeightFactor = 1.15;
            }
            let w1 = Math.floor(getEfw(p.week) * p.pf * gdmWeightFactor);
            if (p.twin) {
                let w2 = Math.floor(getEfw(p.week) * p.pf2);
                o += `EFW: F1 ${w1}g / F2 ${w2}g`;
            } else {
                o += `EFW: ${w1}g`;
            }
        }
        oText.innerText = o;
    }

    const labDiv = document.getElementById('lab-area');
    if (labDiv && p.labs) {
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

    const aText = document.getElementById('a-text');
    if (aText) {
        let probs = [`${p.gravidity}妊${p.parity}産 (${p.parity === 0 ? '初産婦' : '経産婦'})`];
        if (p.hdp) probs.push("妊娠高血圧症候群(HDP)");
        if (p.fgr) probs.push("胎児発育不全(FGR) ⚠");
        if (p.gdm) {
            let status = p.ins ? "[インスリン治療中]" : (p.diet ? "[食事療法中]" : "[未治療]");
            probs.push(`妊娠糖尿病(GDM) ${status}`);
        }
        if (p.cl < 25) probs.push("切迫早産");
        if (p.prev_cs) probs.push("既往帝王切開");
        if (p.fp !== 0) probs.push("胎位異常(骨盤位)");
        if (p.twin) probs.push("双胎妊娠");
        if (p.prom) probs.push("前期破水(PROM)");
        if (p.gbs) probs.push("GBS陽性");
        aText.innerText = probs.join('\n') || "順調";
    }

    const container = document.getElementById('game-container');
    if (container) {
        let bg = p.hosp ? `assets/Inpatient/inpatient_${(w % 2) + 1}.jpg` : `assets/Outpatient/outpatient_${(w % 3) + 1}.jpg`;
        container.style.backgroundImage = `url('${bg}')`;
    }
    renderButtons();
}

function renderButtons() {
    const grid = document.getElementById('btn-grid');
    if (!grid) return;
    grid.innerHTML = "";
    selected.clear();
    let opts = p.hosp ?
        ["安静継続", "塩分制限食", "降圧薬/抑制剤", "NST毎日実施", "退院許可", "分娩決定"] :
        ["妊婦健診", "1週後再診", "2-3日後再診", "自宅安静指示", "鉄剤処方", "管理入院判断"];
    
    // 状態に応じたボタンの動的書き換え
    if (p.gdm) {
        if (!p.diet && !p.ins) opts[p.hosp ? 1 : 4] = "GDM食事指導";
        else if (p.diet && !p.ins) opts[p.hosp ? 1 : 4] = p.hosp ? "インスリン導入" : "外来インスリン導入";
    }
    if (p.hdp) {
        if (!p.salt_diet) opts[p.hosp ? 1 : 3] = "減塩指導";
        else if (!p.med) opts[p.hosp ? 2 : 4] = p.hosp ? "降圧薬/抑制剤" : "外来降圧薬開始";
    }
    if (p.prom) {
        opts[1] = "予防的抗生剤";
        if (p.week < 34) opts[2] = "肺成熟促進剤(ステロイド)";
    }
    if (p.gbs && !p.gbs_treat) {
        opts[3] = "分娩時抗生剤(PCG)";
    }

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
        if (t.includes("食事指導")) p.diet = true;
        if (t.includes("減塩")) p.salt_diet = true;
        if (t.includes("インスリン")) p.ins = true;
        if (t.includes("抗生剤")) p.gbs_treat = true;
        if (t.includes("降圧薬") || t.includes("抑制剤")) p.med = true;
        if (t.includes("安静")) p.rest = true;
        if (t.includes("分娩")) { p.needDel = true; p.reason = "分娩方針決定(予定分娩)"; }
    });
    p.simulate(step);
    if (p.needDel) showDeliveryPhase(); else updateUI();
}

function showDeliveryPhase() {
    document.getElementById('game-ui').style.display = 'none';
    const screen = document.getElementById('delivery-screen');
    screen.style.display = 'flex';
    document.getElementById('game-container').style.backgroundImage = "url('assets/Delivery/delivery.jpg')";

    // 分娩方針画面を初期化 (上書きされていた場合に備えて)
    screen.innerHTML = `
        <h1 style="font-size:48px; text-align:center; margin-bottom:10px; color:#000;">分娩方針の選択</h1>
        <h2 id="del-reason-title" style="font-size:28px; text-align:center; color:#cc0000; margin-bottom:30px;">
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

    // 予定帝王切開や超緊急ならマネジメントを飛ばして結果へ
    if (idx === 3 || idx === 5) {
        p.err = false; p.errMsg = "";
        if (p.reason.includes("重症") && idx !== 5) { p.err = true; p.errMsg = "超緊急事態に対する判断遅れ"; }
        showOutcome();
        return;
    }

    // 分娩マネジメントフェーズへ移行 (経過時間をリセット)
    p.laborHours = 0;
    showLaborManagement(idx);
}

function showLaborManagement(initialIdx) {
    const screen = document.getElementById('delivery-screen');
    
    // 初回のみ Bishop と FHR のベースを生成
    if (p.laborHours === 0) {
        p.bishop = Math.floor(Math.random() * 5) + (p.parity === 1 ? 3 : 1);
        p.fhr = 1;
    } else {
        // 時間経過による変化: Bishopは徐々に改善
        p.bishop += Math.floor(Math.random() * 3);
        if (p.bishop > 13) p.bishop = 13;
        // FGRやHDPの場合、時間経過とともに心拍悪化のリスク上昇
        let fhrDropChance = (p.fgr ? 0.2 : 0.05) + (p.laborHours * 0.02);
        if (Math.random() < fhrDropChance) p.fhr = 3;
    }
    
    // --- 内診所見の生成 ---
    // Bishop 内部数値を臨床所見に分解
    let dilation = Math.min(10, Math.floor(p.bishop * 0.8)); // 0-10cm
    let station = Math.floor(p.bishop / 3) - 2; // -2 to +2
    if (p.bishop >= 12) station = 3;

    // 回旋 (小泉門の向き)
    const rotations = ["小泉門 3時方向 (横位)", "小泉門 2時方向 (右前方回旋)", "小泉門 11時方向 (左前方回旋)", "小泉門 6時方向 (前方回旋: 正常)", "小泉門 12時方向 (後方回旋: 異常)"];
    let rotIdx = (p.bishop < 8) ? 0 : (p.bishop >= 12 ? 3 : Math.floor(Math.random() * 5));
    let rotation = rotations[rotIdx];

    // --- CTG所見の生成 ---
    let ctgDetail = "";
    if (p.fhr === 1) {
        ctgDetail = "基線 140bpm、細変動 中等度、一過性頻脈あり";
    } else if (p.fhr === 2) {
        ctgDetail = "基線 150bpm、細変動 減少、軽度変動一過性徐脈あり";
    } else {
        ctgDetail = "基線 165bpm(頻脈)、細変動 消失、遅発一過性徐脈が頻発 (3回/5収縮)";
    }
    
    // 分娩完了判定
    let deliveryDone = (dilation >= 10 && station >= 2 && Math.random() < 0.7);

    if (deliveryDone) {
        screen.innerHTML = `
            <h1 style="font-size:48px; text-align:center; margin-bottom:20px; color:#000;">分娩進行</h1>
            <div style="background:white; padding:30px; border-radius:15px; border:3px solid #333; max-width:800px; margin:0 auto 40px; text-align:center;">
                <p style="font-size:40px; font-weight:bold;">排臨 〜 発露！</p>
                <p style="font-size:24px; margin-top:10px;">子宮口全開大、下降度 St +3<br>児頭が固定されました。</p>
            </div>
            <button class="btn" style="width:400px; height:100px; margin:0 auto;" onclick="finishLabor(1)">分娩完遂</button>
        `;
        return;
    }

    screen.innerHTML = `
        <h1 style="font-size:42px; text-align:center; margin-bottom:15px; color:#000;">分娩マネジメント (${p.laborHours}h経過)</h1>
        <div style="display:flex; gap:15px; max-width:95%; margin:0 auto 20px;">
            <div style="flex:1; background:white; padding:15px; border-radius:10px; border:2px solid #333;">
                <p style="font-size:20px; border-bottom:2px solid #eee; margin-bottom:10px; font-weight:bold;">【内診所見】</p>
                <p style="font-size:24px;">子宮口: <b>${dilation} cm</b> 開大</p>
                <p style="font-size:24px;">下降度: <b>St ${station >= 0 ? '+' + station : station}</b></p>
                <p style="font-size:22px; color:#666;">回旋: ${rotation}</p>
            </div>
            <div style="flex:1; background:white; padding:15px; border-radius:10px; border:2px solid #333;">
                <p style="font-size:20px; border-bottom:2px solid #eee; margin-bottom:10px; font-weight:bold;">【CTG所見】</p>
                <p style="font-size:22px; line-height:1.4;">${ctgDetail}</p>
                <p style="font-size:22px; font-weight:bold; color:${p.fhr === 3 ? '#cc0000' : '#000'}; margin-top:10px;">判読: Category ${p.fhr === 1 ? 'I' : (p.fhr === 2 ? 'II' : 'III')}</p>
            </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center;">
            <button class="btn" style="width:280px; height:65px;" onclick="p.laborHours+=2; showLaborManagement(${initialIdx})">2時間待機 (様子見)</button>
            <button class="btn" style="width:280px; height:65px; background:#eef;" onclick="tryVacuum(${initialIdx}, ${station})">吸引分娩試行</button>
            <button class="btn" style="width:580px; height:65px; border-color:#cc0000; color:#cc0000;" onclick="finishLabor(3)">緊急帝王切開</button>
        </div>
    `;
}

function tryVacuum(initialIdx, station) {
    p.vacuumAttempts++;
    p.station = station; // 判定用に保存
    
    // 成功確率の計算: St+3なら90%, St+2なら70%, St+1なら30%, St0以下なら5%
    let successChance = (station >= 3 ? 0.9 : (station === 2 ? 0.7 : (station === 1 ? 0.3 : 0.05)));
    // 回旋異常(後方回旋など)があれば確率半減
    if (p.delMode.includes("12時方向") || p.delMode.includes("3時方向")) successChance *= 0.5;

    let isSuccess = Math.random() < successChance;
    const screen = document.getElementById('delivery-screen');

    if (isSuccess) {
        screen.innerHTML = `
            <h1 style="font-size:48px; text-align:center; margin-bottom:20px; color:#000;">吸引成功！</h1>
            <div style="background:white; padding:30px; border-radius:15px; border:3px solid #333; max-width:800px; margin:0 auto 40px; text-align:center;">
                <p style="font-size:40px; font-weight:bold;">児頭娩出</p>
                <p style="font-size:24px; margin-top:10px;">${p.vacuumAttempts}回目の試行で無事に娩出されました。</p>
            </div>
            <button class="btn" style="width:400px; height:100px; margin:0 auto;" onclick="finishLabor(2)">分娩完遂へ</button>
        `;
    } else {
        let isOverLimit = p.vacuumAttempts >= 5;
        screen.innerHTML = `
            <h1 style="font-size:48px; text-align:center; margin-bottom:20px; color:${isOverLimit ? '#cc0000' : '#000'};">吸引失敗 (${p.vacuumAttempts}回目)</h1>
            <div style="background:white; padding:30px; border-radius:15px; border:3px solid #cc0000; max-width:800px; margin:0 auto 40px; text-align:center;">
                <p style="font-size:32px; font-weight:bold; color:#cc0000;">児頭が降りてきません</p>
                <p style="font-size:22px; margin-top:10px;">${isOverLimit ? '<b>これ以上の試行は禁忌です！</b>' : 'もう一度試行しますか？それとも切り替えますか？'}</p>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:15px; justify-content:center;">
                ${isOverLimit ? '' : `<button class="btn" style="width:280px; height:80px;" onclick="tryVacuum(${initialIdx}, ${station})">再吸引を試みる</button>`}
                <button class="btn" style="width:580px; height:80px; border-color:#cc0000; color:#cc0000;" onclick="finishLabor(3)">緊急帝王切開に切り替え</button>
            </div>
        `;
    }
}

function finishLabor(finalIdx) {
    p.err = false; p.errMsg = "";
    
    // 1. そもそも経膣分娩が禁忌（既往帝切、双胎、骨盤位）なのに帝切に切り替えなかった場合
    let cs_ind = p.twin || p.prev_cs || p.fp !== 0;
    if (cs_ind && finalIdx !== 3) {
        p.err = true; p.errMsg = "経膣分娩不可症例（既往帝切/双胎等）の判断ミス";
    }
    
    // 2. 心拍異常(Cat III)への対応
    if (p.fhr === 3 && finalIdx === 1) {
        p.err = true; p.errMsg = p.fgr ? "FGR例でのNRFS見落とし" : "胎児機能不全(NRFS)への対応遅れ";
    }
    
    // 3. 吸引分娩の成功判定 (回数オーバーのチェック)
    if (p.vacuumAttempts > 0) {
        if (p.vacuumAttempts > 5 && finalIdx !== 3) {
            p.err = true; p.errMsg = `吸引5回失敗後の強行（${p.vacuumAttempts}回試行）。児頭損傷のリスク甚大。`;
        } else if (p.station < 2 && finalIdx === 2) {
             p.err = true; p.errMsg = `下降度不足(St ${p.station})での吸引。`;
        }
    }
    
    // 4. 分娩遷延チェック
    let limit = p.parity === 0 ? 24 : 12;
    if (p.laborHours > limit && finalIdx === 1) {
        p.err = true; p.errMsg = "遷延分娩に対する判断の遅れ（母体疲弊・感染リスク）";
    }

    // 5. 抗生剤投与チェック
    if (p.gbs && !p.gbs_treat) { p.err = true; p.errMsg = "GBS抗生剤投与漏れ"; }
    if (p.prom && !p.gbs_treat && p.week < 37) { p.err = true; p.errMsg = "pPROMへの抗生剤欠如"; }
    
    let finalModes = ["経膣分娩", "吸引分娩", "緊急帝王切開"];
    p.delMode += ` → ${finalModes[finalIdx - 1]} (${p.laborHours}h経過)`;
    
    showOutcome();
}

function showOutcome() {
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('outcome-screen').style.display = 'flex';
    let gdmWeightFactor = 1.0;
    if (p.gdm) {
        if (p.ins) gdmWeightFactor = 1.0;
        else if (p.diet) gdmWeightFactor = 1.07;
        else gdmWeightFactor = 1.15;
    }
    let w1 = Math.floor(getEfw(p.week) * p.pf * gdmWeightFactor);
    let weightStr = p.twin ? `F1: ${w1}g / F2: ${Math.floor(getEfw(p.week) * p.pf2)}g` : `${w1}g`;
    document.getElementById('outcome-desc').innerText = `${Math.floor(p.week)}週 分娩\n理由: ${p.reason}\n方針: ${p.delMode}\n児体重: ${weightStr}\n出血量: ${Math.floor((p.err ? 1200 : 400) + Math.random() * 400)}ml`;
    document.getElementById('outcome-audit').innerHTML = p.err ? `<li style="color:#cc0000;">❌ 評価: 不適切<br>理由: ${p.errMsg}<br>Apgar Score: 3/5</li>` : "<li>✅ 評価: 適切<br>ガイドラインに沿った管理でした。<br>Apgar Score: 8/9</li>";
    let bg = p.err ? "assets/outcume/bad.jpg" : "assets/outcume/delivery_good.jpg";
    document.getElementById('game-container').style.backgroundImage = `url('${bg}')`;
}

// --- 画像プリロード機能 (高速化) ---
const ASSETS = [
    'assets/mainmenu/mainmenu.jpg',
    'assets/Outpatient/outpatient_1.jpg', 'assets/Outpatient/outpatient_2.jpg', 'assets/Outpatient/outpatient_3.jpg',
    'assets/Inpatient/inpatient_1.jpg', 'assets/Inpatient/inpatient_2.jpg',
    'assets/Delivery/delivery.jpg',
    'assets/outcume/delivery_good.jpg', 'assets/outcume/bad.jpg'
];

function preloadImages() {
    ASSETS.forEach(path => {
        const img = new Image();
        img.src = path;
    });
}
