// game.js
// 産科臨床シミュレーター Web版 ロジックエンジン v2.0
// 画像拡張子は .jpg で統一。複数選択UIを強化。

// --- 胎児発育曲線データ ---
// --- 胎児発育曲線データ (main.py/JSOG準拠: [Mean, SD]) ---
const EFW_DATA = { 18:[200,30], 20:[300,45], 22:[450,65], 24:[650,90], 26:[900,120], 28:[1200,160], 30:[1500,200], 32:[1850,240], 34:[2200,280], 36:[2550,320], 38:[2900,350], 40:[3200,380], 42:[3450,400] };

const getEfw = (w) => {
    const keys = Object.keys(EFW_DATA).map(Number).sort((a, b) => a - b);
    if (w < 18) return [0.01, 1.0];
    if (w >= 42) return EFW_DATA[42];
    for (let i = 0; i < keys.length - 1; i++) {
        if (w >= keys[i] && w < keys[i + 1]) {
            let t = (w - keys[i]) / (keys[i + 1] - keys[i]);
            let mean = EFW_DATA[keys[i]][0] + t * (EFW_DATA[keys[i + 1]][0] - EFW_DATA[keys[i]][0]);
            let sd = EFW_DATA[keys[i]][1] + t * (EFW_DATA[keys[i + 1]][1] - EFW_DATA[keys[i]][1]);
            return [mean, sd];
        }
    }
    return EFW_DATA[42];
};

function getSymptom(p) {
    const w = Math.floor(p.week);
    let pool = [];
    
    if (p.needDel) {
        // 分娩前・陣痛
        pool = [
            "お腹が規則的に痛くなってきました", "腰がずーんと重だるいです", 
            "胎動はしっかり感じます", "何か降りてくるような感覚があります", 
            "10分おきに痛みがきます", "おしるしのような出血がありました", 
            "いきみたい感じが少しあります", "陣痛がだんだん強くなっています",
            "お腹がカチカチに張ります", "もうすぐ産まれそうな気がします"
        ];
    } else if (p.hellp) {
        // HELLP症候群
        pool = [
            "胃のあたりが気持ち悪くて吐き気がします", "目がチカチカして見えにくいです", 
            "右上腹部（お腹の右側）が痛みます", "ひどい頭痛がします", "全身がだるくて動けません"
        ];
    } else if (p.hdp) {
        // HDP
        if (p.bp > 160) {
            pool = ["頭が重くて割れそうです", "目がチカチカします", "顔や手がひどくむくんでいます", "耳鳴りがします"];
        } else {
            pool = ["少し頭が重い感じがします", "肩がひどくこります", "むくみが気になります", "特に症状はありません"];
        }
    } else if (p.prom) {
        // PROM (破水)
        pool = ["水のようなものが流れ出ました", "尿漏れかと思ったのですが止まりません", "下着がぐっしょり濡れています"];
    } else if (p.fgr) {
        // FGR (発育不全 - 自覚症状は乏しいが)
        pool = ["お腹があまり大きくならない気がします", "胎動はありますが、少し弱い気がします", "周りの人に、お腹が小さいねと言われました"];
    } else if (p.cl < 25) {
        // 切迫
        pool = ["お腹がよく張ります", "足の付け根が重だるいです", "下りものが増えた気がします", "お腹が下に引っ張られる感じです"];
    } else {
        // 正常 (尿漏れなどの紛らわしい主訴も混ぜるが、Aに破水がない場合は生理的なものとする)
        pool = [
            "特に変わりありません", "胎動は元気に感じます", "順調だと思います", 
            "少し腰が痛い時があります", "体調は良いです",
            "たまに足の付け根がちくっとします", "トイレが近くて困ります"
        ];
    }
    
    return pool[Math.floor(Math.random() * pool.length)];
}

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
        this.pf = 0.8 + Math.random() * 0.35; // 胎盤機能 (0.8以下でFGRリスク)
        if (Math.random() < 0.1) this.pf -= 0.15; // 10%で高度な胎盤不全
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
        this.antibiotics = false;
        this.nrfsCount = 0;
        this.art = Math.random() < 0.15; // ART妊娠フラグ
        
        // --- 既往歴 (main.pyロジックの統合) ---
        this.hist_ht = Math.random() < 0.05;
        this.hist_dm = Math.random() < 0.03;
        this.hist_asthma = Math.random() < 0.08;
        this.hist_thyroid = Math.random() < 0.04;
        this.hist_autoimmune = Math.random() < 0.05 ? (Math.random() < 0.5 ? "SLE" : "APS") : null;
        this.placenta_previa = Math.random() < 0.015;

        // リスク倍率の計算
        this.risk_mult = 1.0;
        if (this.age > 35) this.risk_mult *= 1.5;
        if (this.bmi > 25) this.risk_mult *= 1.8;
        if (this.art) this.risk_mult *= 1.2;
        if (this.hist_ht) this.risk_mult *= 2.5;
        if (this.hist_autoimmune) this.risk_mult *= 3.0;

        this.pendingOgtt = false; // 75gOGTT精査予約
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
            let hdpRisk = (this.bmi > 25 ? 0.04 : 0.01) * (this.twin ? 2.5 : 1.0) * this.risk_mult;
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
            let clStep = (0.5 + Math.random() * 1.5) * (this.twin ? 1.8 : 1.0) * (this.art ? 1.2 : 1.0) * (this.risk_mult > 2.0 ? 1.3 : 1.0);
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

        // FGR判定 (SD値に基づく診断)
        let [mean, sdVal] = getEfw(w);
        let currentSd = (mean * this.pf - mean) / sdVal;
        if (currentSd < -1.5) this.fgr = true;

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
        
        // スクリーニング精査 (75gOGTT) の処理
        if (this.pendingOgtt) {
            this.gdm = Math.random() < 0.7; // スクリーニング陽性後の精査なので確率は高め
            this.labs = { 
                "Type": "75gOGTT精査", "週数": w, 
                "75gOGTT": this.gdm ? "98 - 192 - 160 (異常)" : "85 - 140 - 110 (正常)"
            };
            this.pendingOgtt = false;
            this.labW = w;
            return;
        }

        if (w >= 10 && w <= 12 && this.labW < 10) {
            // 初期検査項目拡充: HIV, クラミジア, HTLV-1, HCV追加
            let glucose = 85 + Math.floor(Math.random() * 30); 
            this.labs = { 
                "Type": "初期", "週数": w, 
                "Hb": (11.5 + Math.random() * 2).toFixed(1), 
                "Plt": Math.floor(15 + Math.random() * 15) + "万", 
                "血糖": glucose, 
                "風疹": "HI 32x", "HBsAg": "陰性", "HCV": "陰性",
                "HIV": "陰性", "HTLV-1": "陰性", "クラミジア": "陰性",
                "子宮頸がん": "NILM" 
            };
            this.labW = w;
        } else if (w >= 24 && w <= 26 && this.labW < 24) {
            if (Math.random() < 0.1) this.gdm = true;
            if (this.gdm) {
                // 50gGCT異常から直ちに75gOGTT施行・結果表示
                this.labs = { 
                    "Type": "中期(GDM精査)", "週数": w, 
                    "50gGCT": "148 (異常)", 
                    "75gOGTT": "96 - 188 - 158 (GDM診断)",
                    "Hb": (10.5 + Math.random() * 2).toFixed(1) 
                };
            } else {
                this.labs = { "Type": "中期", "週数": w, "50gGCT": "102 (正常)", "Hb": (10.5 + Math.random() * 2).toFixed(1) };
            }
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
                "AST": this.hellp ? 75 + Math.floor(Math.random() * 50) : 25,
                "ALT": this.hellp ? 80 + Math.floor(Math.random() * 60) : 20,
                "LDH": this.hellp ? 620 + Math.floor(Math.random() * 300) : 190
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
    document.getElementById('s-text').innerText = getSymptom(p);
    
    let efw = 0, sdText = "0.0";
    if (w >= 18) {
        let gdmFactor = (p.gdm && !p.ins) ? 1.12 : 1.0;
        let [meanEfw, sdVal] = getEfw(p.week);
        efw = Math.floor(meanEfw * p.pf * gdmFactor);
        sdText = ((efw - meanEfw) / sdVal).toFixed(1);
    }
    
    let o = `BP: ${Math.floor(p.bp)}/${Math.floor(p.bp_d)} mmHg\n`;
    o += `体重: ${p.wt.toFixed(1)}kg (+${(p.wt - p.wt0).toFixed(1)}kg)\n`;
    o += `尿蛋白: ${p.hdp ? (p.bp > 160 ? '(2+)' : '(1+)') : '(-)'} / 尿糖: ${p.gdm ? '(1+)' : '(-)'}\n`;
    o += `CL: ${p.cl.toFixed(1)}mm\n`;
    if (w >= 18) {
        if (p.twin) o += `EFW: F1 ${efw}g(${sdText}SD) / F2 ${Math.floor(efw * 0.95)}g`;
        else o += `EFW: ${efw}g (${sdText}SD)`;
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

    // A (簡潔なリスト形式へ)
    let probs = [];
    probs.push(`${p.gravidity}妊${p.parity}産${p.prev_cs ? '(既往CS)' : ''}`);
    
    let currentRisks = [];
    if (p.twin) currentRisks.push("双胎");
    if (p.art) currentRisks.push("ART");
    if (p.placenta_previa) currentRisks.push("前置胎盤 ⚠");
    if (currentRisks.length > 0) probs.push(currentRisks.join('、'));
    
    let complications = [];
    if (p.hellp) complications.push("HELLP");
    else if (p.hdp) complications.push("HDP");
    if (p.gdm) complications.push("GDM");
    if (p.fgr) complications.push("FGR");
    if (p.cl < 25) complications.push("切迫早産");
    if (p.prom) complications.push(p.cam ? "CAM" : "PROM");
    if (complications.length > 0) probs.push(complications.join('、'));

    let history = [];
    if (p.hist_ht) history.push("既往高血圧");
    if (p.hist_dm) history.push("既往DM");
    if (p.hist_asthma) history.push("喘息");
    if (p.hist_thyroid) history.push("甲状腺疾患");
    if (p.hist_autoimmune) history.push(p.hist_autoimmune);
    if (history.length > 0) probs.push("既往: " + history.join('、'));

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
    if (k === "血糖" && val >= 100) return true;
    if (k === "AST" && val >= 70) return true;
    if (k === "ALT" && val >= 70) return true;
    if (k === "LDH" && val >= 600) return true;
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
        // 外来セット (動的生成)
        opts.push(`妊婦健診 (${interval})`);
        opts.push("1週後再診 (監視)");
        
        if (p.fgr) opts.push("2-3日後再診 (厳重)");
        if (p.gdm) opts.push("GDM食事指導/投薬");
        if (p.hdp) opts.push("降圧薬の検討");
        if (p.cl < 30) opts.push("張りどめ処方");
        if (p.art) opts.push("スクリーニング精査");
        
        opts.push("自宅安静指示");
        opts.push("鉄剤・漢方等処方");

        // 重複排除して上位5つを確保
        let temp = [...new Set(opts)];
        opts = temp.slice(0, 5);
        // 6番目に必ず入院管理を入れる
        opts[5] = "管理入院の判断";
    } else {
        // 入院セット (動的生成)
        opts.push("安静継続 (1週後)");
        if (p.hdp) opts.push("降圧薬 調整");
        if (p.cl < 25) opts.push("抑制剤 調整");
        if (p.gdm) opts.push("糖尿病食/インスリン");
        if (p.week < 34) opts.push("リンデロン(肺成熟)");
        
        opts.push("NST (毎日施行)");
        opts.push("分娩方針の検討");
        opts.push("母体搬送の検討");
        opts.push("退院の検討");

        opts = [...new Set(opts)].slice(0, 6);
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
        if (t.includes("母体搬送")) { 
            p.mode = 'High-Risk'; 
            p.hosp = true; // 搬送先では入院管理となる
            alert("高度医療センターへ母体搬送されました。管理を引き継ぎます。");
        }
        if (t.includes("スクリーニング精査")) {
            p.pendingOgtt = true;
        }
        if (t.includes("食事指導")) p.diet = true;
        if (t.includes("インスリン")) { p.ins = true; p.hosp = true; }
        if (t.includes("リンデロン")) p.steroid = true;
        if (t.includes("降圧薬") || t.includes("抑制剤")) p.med = true;
        if (t.includes("安静指示")) p.rest = true;
        if (t.includes("分娩方針")) { p.needDel = true; p.reason = p.reason || "分娩方針決定"; }
    });
    
    // 分娩フラグが立っている場合は即座に移行（シミュレートを挟まない）
    if (p.needDel) {
        showDeliveryPhase();
    } else {
        p.simulate(step);
        if (p.needDel) showDeliveryPhase(); else updateUI();
    }
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

    // 予定帝王切開(3)、緊急帝王切開(4)、超緊急帝王切開(5) は即座に結果へ
    if (idx >= 3) {
        showOutcome();
        return;
    }
    
    // 経膣系は分娩管理フェーズへ
    p.laborHours = 0;
    showLaborManagement(idx);
}

function showLaborManagement(initialIdx) {
    const screen = document.getElementById('delivery-screen');
    const isHighRisk = (p.hdp || p.fgr || p.twin || p.week < 37 || p.gdm);

    if (p.laborHours === 0) {
        p.bishop = Math.floor(Math.random() * 4) + (p.parity === 1 ? 4 : 2);
        if (isHighRisk) p.bishop -= 1;
        p.fhr = 1;
    } else {
        let progression = Math.floor(Math.random() * 3);
        p.bishop += progression;
        if (p.bishop > 13) p.bishop = 13;
        
        if (progression === 0 && p.laborHours > 0 && p.fhr === 1) {
            alert("子宮口の開大・児頭の下降に変化がありません（分娩進行停滞）。");
        }

        // --- 異常出現率ロジック ---
        // 3回目(4h-6h)あたりに異常が出やすいよう調整
        let abnProb = 0.05;
        if (p.laborHours >= 4) abnProb = 0.20;
        if (p.laborHours >= 8) abnProb = 0.35;
        
        // 合併症がある場合はリスクを上乗せ
        if (isHighRisk) abnProb += 0.10;
        
        if (p.fhr !== 3 && Math.random() < abnProb) {
            p.fhr = 3; // Cat III発生
            p.nrfsCount = 1;
        }
    }
    
    let dilation = Math.min(10, Math.floor(p.bishop * 0.8));
    let station = Math.floor(p.bishop / 3) - 2;
    if (p.bishop >= 12) station = 3;

    let ctgDetail = p.fhr === 3 ? "細変動消失・遅発一過性徐脈" : "基線 145bpm・細変動良好";
    // 帝王切開率が全体で30-40%（高度医療センターで高め）になるよう成功率を微調整
    let successProb = isHighRisk ? 0.50 : 0.75;
    let deliveryDone = (dilation >= 10 && station >= 2 && Math.random() < successProb);

    if (deliveryDone && p.fhr === 1) {
        screen.innerHTML = `<h1 style="font-size:48px; text-align:center;">分娩完遂</h1><button class="btn" style="width:400px; height:100px; margin:40px auto;" onclick="finishLabor(1)">分娩記録を記入</button>`;
        return;
    }

    let nextStepHtml = "";
    if (p.fhr === 3) {
        nextStepHtml = `<button class="btn" style="width:230px; height:65px; border-color:red; background:#fff0f0;" onclick="recheckFHR(${initialIdx})">15分後に再確認</button>`;
    } else {
        nextStepHtml = `
            <button class="btn" style="width:230px; height:65px;" onclick="p.laborHours+=2; showLaborManagement(${initialIdx})">2時間待機</button>
            <button class="btn" style="width:230px; height:65px; border-color:#666;" onclick="p.laborHours+=0.25; showLaborManagement(${initialIdx})">15分監視</button>
        `;
    }

    let abxBtn = "";
    if (!p.antibiotics && (p.prom || p.gbs)) {
        abxBtn = `<button class="btn" style="width:230px; height:65px; border-color:#0066cc; color:#0066cc;" onclick="p.antibiotics=true; showLaborManagement(${initialIdx})">抗生剤投与</button>`;
    } else if (p.antibiotics) {
        abxBtn = `<button class="btn" style="width:230px; height:65px; background:#e0f0ff; cursor:default;">抗生剤投与済</button>`;
    }

    screen.innerHTML = `
        <h1 style="font-size:42px; text-align:center;">分娩管理 (${p.laborHours}h経過)</h1>
        <div style="display:flex; gap:15px; padding:20px; max-width:900px; margin:0 auto;">
            <div style="flex:1; background:white; padding:15px; border:2px solid #333;">
                <p style="font-size:24px;">子宮口: ${dilation}cm</p>
                <p style="font-size:24px;">下降度: St ${station >= 0 ? '+' + station : station}</p>
            </div>
            <div style="flex:1; background:white; padding:15px; border:2px solid #333;">
                <p style="font-size:24px;">CTG: ${ctgDetail}</p>
                <p style="font-size:24px; color:${p.fhr===3?'red':'black'}">判定: ${p.fhr===1?'正常 (Cat I)':'異常 (Cat III) ⚠'}</p>
            </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin-top:20px;">
            ${nextStepHtml}
            ${abxBtn}
            <button class="btn" style="width:230px; height:65px;" onclick="tryVacuum(${initialIdx}, ${station})">吸引分娩</button>
            <button class="btn" style="width:580px; height:65px; border-color:#cc0000; color:#cc0000;" onclick="finishLabor(3)">緊急帝王切開</button>
        </div>
    `;
}

function recheckFHR(initialIdx) {
    p.laborHours += 0.25;
    p.nrfsCount++;
    // 改善率を90%に設定
    if (Math.random() < 0.9) {
        p.fhr = 1;
        alert("15分後の再確認：心拍が改善しました。分娩監視を継続します。");
    } else {
        alert("15分後の再確認：心拍異常が継続しています。迅速な児の救出（緊急帝王切開）を検討してください。");
    }
    showLaborManagement(initialIdx);
}

function tryVacuum(initialIdx, station) {
    p.vacuumAttempts++;
    const isHighRisk = (p.hdp || p.fgr || p.twin || p.week < 37);
    
    // 成功確率: St+2以上で高いが、ハイリスク時は成功率を20%減少させる
    let successChance = (station >= 2 ? 0.8 : (station === 1 ? 0.3 : 0.05));
    if (isHighRisk) successChance *= 0.8; 

    if (Math.random() < successChance) {
        finishLabor(2);
    } else if (p.vacuumAttempts >= 3) { 
        alert("吸引不可。児頭が下降しません。緊急帝王切開に切り替えます。"); 
        p.delMode = "緊急帝王切開 (分娩停止・吸引不成功)";
        showOutcome(); 
    } else { 
        alert("吸引かかりません。再試行または切替えを検討してください。"); 
        showLaborManagement(initialIdx); 
    }
}

function finishLabor(finalIdx) {
    let cs_ind = p.twin || p.prev_cs || p.fp !== 0;
    if (cs_ind && finalIdx !== 3) { p.err = true; p.errMsg = "帝切適応（双胎・既往帝切・骨盤位等）の見逃し"; }
    else if (p.fhr === 3 && finalIdx === 1) { p.err = true; p.errMsg = "NRFS(Cat III)への対応不備"; }
    else if (p.week < 34 && !p.steroid) { p.err = true; p.errMsg = "早産児へのステロイド未投与"; }
    else if ((p.prom || p.gbs) && !p.antibiotics) { p.err = true; p.errMsg = "感染予防の抗生剤未投与"; }
    else if (p.fhr === 3 && p.nrfsCount > 3 && finalIdx !== 3) { p.err = true; p.errMsg = "遷延するNRFSに対し、遂娩決定の遅れ"; }
    
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
    
    let auditHtml = "";
    if (p.err) {
        auditHtml = `<li style="color:red; font-weight:bold;">評価: 不適切</li>
                     <li style="color:red;">理由: ${p.errMsg}</li>
                     <li style="margin-top:10px; font-size:24px; color:#555;">※産婦人科診療ガイドライン（産科編）に基づき、管理の遅れや適応の見落としが判定されました。</li>`;
    } else {
        auditHtml = `<li style="color:green; font-weight:bold;">評価: 適切</li>
                     <li>ガイドラインに沿った適切な判断でした。</li>
                     <li style="margin-top:10px; font-size:22px; color:#666;">
                        【確認項目】<br>
                        ・分娩停止/指示の有無<br>
                        ・NRFS(Cat III)への迅速な対応<br>
                        ${(p.prom || p.gbs) ? '・PROM/GBSへの抗生剤使用<br>' : ''}
                        ${(p.week < 34) ? '・早産例へのステロイド投与<br>' : ''}
                        ${(p.week >= 41) ? '・過期妊娠の適正な遂娩<br>' : ''}
                     </li>`;
    }
    document.getElementById('outcome-audit').innerHTML = auditHtml;
    
    // 帝王切開の場合は背景をCS.jpgに、それ以外は結果に応じた背景に
    let bg = "assets/outcume/delivery_good.jpg";
    if (p.delMode.includes("帝王切開")) {
        bg = "assets/CS/CS.jpg";
    } else if (p.err) {
        bg = "assets/outcume/bad.jpg";
    }
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
